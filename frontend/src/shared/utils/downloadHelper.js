/**
 * Centralized Binary File Download Handler
 * Ensures cross-browser stability and correct MIME type recognition
 */
export const triggerFileDownload = (data, fileName, format) => {
  const mimeTypes = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    pdf: 'application/pdf',
    zip: 'application/zip'
  };

  const extensions = {
    excel: 'xlsx',
    csv: 'csv',
    pdf: 'pdf',
    zip: 'zip'
  };

  try {
    const blob = new Blob([data], { 
      type: mimeTypes[format] || 'application/octet-stream' 
    });
    
    // Check if the browser supports BLOB URLs
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Sanitize filename to avoid weird character issues
    const sanitizedName = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ext = extensions[format] || format;
    link.setAttribute('download', `${sanitizedName}.${ext}`);
    
    // Add to body and trigger - mandatory for some engines (Firefox/Safari)
    document.body.appendChild(link);
    link.click();
    
    // Cleanup properly
    if (link.parentNode) {
      document.body.removeChild(link);
    }
    
    window.URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Binary Download Error:', error);
    return false;
  }
};
