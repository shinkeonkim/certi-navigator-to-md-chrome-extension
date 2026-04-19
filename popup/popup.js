document.getElementById('downloadBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  
  statusEl.style.display = 'none';
  errorEl.style.display = 'none';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject the content script to extract text and download the file.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/extract.js']
    });

    statusEl.style.display = 'block';
  } catch (err) {
    console.error(err);
    errorEl.style.display = 'block';
  }
});
