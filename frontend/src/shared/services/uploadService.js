import api from '../api/axiosInstance';

export const uploadService = {
  /**
   * Upload an image (base64) to Cloudinary via the backend
   * @param {string} base64Image - The base64 string of the image
   * @param {string} folder - Destination folder on Cloudinary
   * @returns {Promise<{url: string, publicId: string, format: string}>}
   */
  uploadImage: async (base64Image, folder = 'general') => {
    try {
      const response = await api.post('/common/upload/image', {
        image: base64Image,
        folder
      });
      return response?.data || response;
    } catch (error) {
      console.error('Upload Service Error:', error);
      throw error;
    }
  }
};
