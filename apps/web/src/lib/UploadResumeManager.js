const STORAGE_KEY = 'novakleen_upload_sessions';

export const UploadResumeManager = {
  saveUploadSession(uploadId, fileInfo, chunks, progress) {
    try {
      const sessions = this.getAllSessions();
      sessions[uploadId] = {
        uploadId,
        fileName: fileInfo.name,
        fileSize: fileInfo.size,
        fileType: fileInfo.type,
        projectId: fileInfo.projectId,
        path: fileInfo.path,
        // Simplified for single-stream uploads
        progress,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save upload session", e);
    }
  },

  getAllSessions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  },

  loadUploadSession(uploadId) {
    const sessions = this.getAllSessions();
    return sessions[uploadId] || null;
  },

  deleteUploadSession(uploadId) {
    try {
      const sessions = this.getAllSessions();
      if (sessions[uploadId]) {
        delete sessions[uploadId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      }
    } catch (e) {
      console.error("Failed to delete upload session", e);
    }
  },

  findSessionForFile(file) {
    const sessions = this.getAllSessions();
    return Object.values(sessions).find(s => 
      s.fileName === file.name && s.fileSize === file.size
    );
  }
};