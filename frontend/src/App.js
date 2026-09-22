import React, { useState, useEffect } from 'react';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import { FaUpload, FaDownload, FaTrash, FaShare, FaFile, FaFolder } from 'react-icons/fa';

const API_URL = 'http://localhost:5000/api';
const USER_ID = 'user123'; // In production, get from authentication
const USERNAME = 'saiteja';

function App() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`${API_URL}/files`, {
        headers: { 'x-user-id': USER_ID }
      });
      setFiles(response.data.data.files);
    } catch (error) {
      showMessage('error', 'Failed to load files');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/files/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-user-id': USER_ID,
          'x-username': USERNAME
        }
      });

      showMessage('success', 'File uploaded successfully!');
      fetchFiles();
    } catch (error) {
      showMessage('error', error.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (fileId, fileName) => {
    try {
      const response = await axios.get(`${API_URL}/files/${fileId}/download`, {
        headers: { 'x-user-id': USER_ID }
      });

      // Create download link
      const link = document.createElement('a');
      link.href = response.data.data.downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showMessage('success', 'Download started!');
    } catch (error) {
      showMessage('error', 'Download failed');
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      await axios.delete(`${API_URL}/files/${fileId}`, {
        headers: { 'x-user-id': USER_ID }
      });

      showMessage('success', 'File deleted successfully');
      fetchFiles();
    } catch (error) {
      showMessage('error', 'Delete failed');
    }
  };

  const handleShare = async (fileId) => {
    try {
      const response = await axios.post(`${API_URL}/files/${fileId}/share`, {}, {
        headers: { 'x-user-id': USER_ID }
      });

      // Copy to clipboard
      await navigator.clipboard.writeText(response.data.data.shareableUrl);
      showMessage('success', 'Shareable link copied to clipboard!');
    } catch (error) {
      showMessage('error', 'Failed to generate share link');
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="container mt-4">
      <div className="row">
        <div className="col-md-12">
          <h2 className="mb-4">
            <FaFile className="me-2" />
            Cloud File Manager
          </h2>

          {/* Message Alert */}
          {message.text && (
            <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} alert-dismissible fade show`} role="alert">
              {message.text}
              <button type="button" className="btn-close" onClick={() => setMessage({ type: '', text: '' })}></button>
            </div>
          )}

          {/* Upload Section */}
          <div className="card mb-4">
            <div className="card-body">
              <h5 className="card-title">
                <FaUpload className="me-2" />
                Upload File
              </h5>
              <input
                type="file"
                className="form-control"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              {uploading && (
                <div className="progress mt-2">
                  <div className="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style={{ width: '100%' }}>
                    Uploading...
                  </div>
                </div>
              )}
              <small className="text-muted">
                Allowed: JPEG, PNG, GIF, PDF, TXT, DOC, DOCX (Max 10MB)
              </small>
            </div>
          </div>

          {/* Files List */}
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">
                <FaFolder className="me-2" />
                Your Files ({files.length})
              </h5>
            </div>
            <div className="card-body">
              {files.length === 0 ? (
                <p className="text-muted text-center">No files uploaded yet</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>File Name</th>
                        <th>Size</th>
                        <th>Uploaded</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((file) => (
                        <tr key={file.key}>
                          <td>
                            <FaFile className="me-2 text-primary" />
                            {file.fileName}
                          </td>
                          <td>{formatFileSize(file.size)}</td>
                          <td>{new Date(file.lastModified).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="btn btn-sm btn-outline-primary me-2"
                              onClick={() => handleDownload(file.metadata?.id, file.fileName)}
                              title="Download"
                            >
                              <FaDownload />
                            </button>
                            <button
                              className="btn btn-sm btn-outline-success me-2"
                              onClick={() => handleShare(file.metadata?.id)}
                              title="Share"
                            >
                              <FaShare />
                            </button>
                            <button
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleDelete(file.metadata?.id)}
                              title="Delete"
                            >
                              <FaTrash />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;