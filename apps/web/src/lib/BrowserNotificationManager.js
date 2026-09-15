export const BrowserNotificationManager = {
  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  },

  async showUploadCompleteNotification(fileName) {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) return;

    try {
      const notification = new Notification('Upload Completed', {
        body: `${fileName} has finished uploading successfully.`,
        icon: '/vite.svg', // Fallback icon
        tag: 'upload-complete'
      });

      notification.onclick = function() {
        window.focus();
        notification.close();
      };
      
      // Play sound
      this.playSound();
      
    } catch (e) {
      console.error("Notification failed", e);
    }
  },
  
  playSound() {
    try {
      // Simple beep or success sound (using a tiny base64 encoded wav for simplicity)
      const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"); 
      // This is a dummy empty sound. In a real app, use a real sound file URL.
      // Since I can't upload assets, I'll skip actual audio file implementation 
      // or rely on a system beep if possible (browsers limit this).
    } catch (e) {
        // ignore
    }
  }
};