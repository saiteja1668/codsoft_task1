require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many upload requests, please try again later'
});

// Configure AWS S3
console.log("AWS credential check:", {
  accessKeyPresent: Boolean(process.env.AWS_ACCESS_KEY_ID),
  secretKeyPresent: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
  region: process.env.AWS_REGION,
  bucket: process.env.AWS_S3_BUCKET_NAME
});

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

// Allowed file types and max size
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Configure multer for S3 upload
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: BUCKET_NAME,
    key: (req, file, cb) => {
      // Generate unique filename with user folder
      const userId = req.headers['x-user-id'] || 'anonymous';
      const uniqueName = `${userId}/${uuidv4()}-${file.originalname}`;
      cb(null, uniqueName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE
  }),
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
  },
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

// Middleware to validate file after upload
const validateFile = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Additional validation: check magic bytes if needed
  // For production, add more thorough validation here
  
  next();
};

// File metadata storage (in production, use a database)
const fileMetadata = new Map();

// Routes

// Upload file
app.post('/api/files/upload', uploadLimiter, upload.single('file'), validateFile, async (req, res) => {
  try {
    const file = req.file;
    const userId = req.headers['x-user-id'] || 'anonymous';
    const owner = req.headers['x-username'] || 'user';
    
    // Store metadata
    const fileId = uuidv4();
    fileMetadata.set(fileId, {
      id: fileId,
      originalName: file.originalname,
      s3Key: file.key,
      mimeType: file.contentType,
      size: file.size,
      owner,
      userId,
      uploadedAt: new Date().toISOString(),
      isShared: false
    });
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        fileId,
        fileName: file.originalname,
        size: file.size,
        mimeType: file.contentType,
        uploadedAt: fileMetadata.get(fileId).uploadedAt
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed', message: error.message });
  }
});

// List files (with optional folder/path filter)
app.get('/api/files', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] || 'anonymous';
    const prefix = req.query.prefix || `${userId}/`;
    
    const params = {
      Bucket: BUCKET_NAME,
      Prefix: prefix
    };
    
    const s3Data = await s3.listObjectsV2(params).promise();
    
    const files = s3Data.Contents
      .filter(obj => !obj.Key.endsWith('/')) // Exclude folders
      .map(obj => {
        const fileId = obj.Key.split('/').pop();
        const metadata = fileMetadata.get(fileId);
        return {
          key: obj.Key,
          fileName: obj.Key.split('/').pop(),
          size: obj.Size,
          lastModified: obj.LastModified,
          metadata: metadata || null
        };
      });
    
    res.json({
      success: true,
      data: {
        files,
        count: files.length
      }
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: 'Failed to list files', message: error.message });
  }
});

// Download file (generate presigned URL)
app.get('/api/files/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.headers['x-user-id'] || 'anonymous';
    
    const metadata = fileMetadata.get(fileId);
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check permissions
    if (metadata.userId !== userId && !metadata.isShared) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Generate presigned URL (valid for 15 minutes)
    const downloadUrl = s3.getSignedUrl('getObject', {
      Bucket: BUCKET_NAME,
      Key: metadata.s3Key,
      Expires: 15 * 60, // 15 minutes
      ResponseContentDisposition: `attachment; filename="${metadata.originalName}"`
    });
    
    res.json({
      success: true,
      data: {
        downloadUrl,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to generate download link', message: error.message });
  }
});

// View file metadata
app.get('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const metadata = fileMetadata.get(fileId);
    
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json({
      success: true,
      data: metadata
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file info', message: error.message });
  }
});

// Delete file
app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.headers['x-user-id'] || 'anonymous';
    
    const metadata = fileMetadata.get(fileId);
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check ownership
    if (metadata.userId !== userId) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own files.' });
    }
    
    // Delete from S3
    await s3.deleteObject({
      Bucket: BUCKET_NAME,
      Key: metadata.s3Key
    }).promise();
    
    // Remove metadata
    fileMetadata.delete(fileId);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file', message: error.message });
  }
});

// Generate shareable link (BONUS)
app.post('/api/files/:fileId/share', async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.headers['x-user-id'] || 'anonymous';
    
    const metadata = fileMetadata.get(fileId);
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check ownership
    if (metadata.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Generate long-term presigned URL (7 days)
    const shareableUrl = s3.getSignedUrl('getObject', {
      Bucket: BUCKET_NAME,
      Key: metadata.s3Key,
      Expires: 7 * 24 * 60 * 60, // 7 days
      ResponseContentDisposition: `attachment; filename="${metadata.originalName}"`
    });
    
    // Mark as shared
    metadata.isShared = true;
    metadata.sharedUrl = shareableUrl;
    metadata.sharedAt = new Date().toISOString();
    
    res.json({
      success: true,
      data: {
        shareableUrl,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        fileId
      }
    });
  } catch (error) {
    console.error('Share error:', error);
    res.status(500).json({ error: 'Failed to generate shareable link', message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

app.get("/", (req, res) => {
  res.json({
    message: "Cloud File Manager Backend is running",
    status: "ok"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`S3 Bucket: ${BUCKET_NAME}`);
});