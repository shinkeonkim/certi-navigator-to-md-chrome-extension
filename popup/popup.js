const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');

const DEFAULT_ERROR =
  '해당 페이지에서 실행할 수 없거나 오류가 발생했습니다.';

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.style.display = 'block';
  errorEl.style.display = 'none';
}

function showError(message) {
  errorEl.textContent = message || DEFAULT_ERROR;
  errorEl.style.display = 'block';
  statusEl.style.display = 'none';
}

function clearMessages() {
  statusEl.textContent = '';
  errorEl.textContent = '';
  statusEl.style.display = 'none';
  errorEl.style.display = 'none';
}

function setButtonsDisabled(disabled) {
  downloadBtn.disabled = disabled;
  copyBtn.disabled = disabled;
}

async function extractMarkdown() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('활성 탭을 찾을 수 없습니다.');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content/extract.js'],
  });

  const result = results?.[0]?.result;
  if (!result || !result.markdown) {
    throw new Error('문제 제목을 찾을 수 없거나 추출에 실패했습니다.');
  }

  return { tabId: tab.id, ...result };
}

function triggerPageDownload(tabId, markdown, title) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (md, t) => {
      const maxFilenameLen = 30;
      let safeTitle = t.split('\n')[0].replace(/[/\\?%*:|"<>]/g, '-').trim();
      if (safeTitle.length > maxFilenameLen) {
        safeTitle = safeTitle.substring(0, maxFilenameLen) + '...';
      }
      const filename = `${safeTitle}.md`;

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    },
    args: [markdown, title],
  });
}

async function copyToClipboard(markdown, tabId) {
  try {
    await navigator.clipboard.writeText(markdown);
    return;
  } catch (popupErr) {
    console.warn('Popup clipboard write failed, falling back to page:', popupErr);
  }

  const fallback = await chrome.scripting.executeScript({
    target: { tabId },
    func: async md => {
      try {
        await navigator.clipboard.writeText(md);
        return { ok: true };
      } catch (err) {
        try {
          const textarea = document.createElement('textarea');
          textarea.value = md;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          const succeeded = document.execCommand('copy');
          document.body.removeChild(textarea);
          return succeeded
            ? { ok: true }
            : { ok: false, error: 'execCommand copy returned false' };
        } catch (innerErr) {
          return { ok: false, error: innerErr?.message || String(innerErr) };
        }
      }
    },
    args: [markdown],
  });

  const fallbackResult = fallback?.[0]?.result;
  if (!fallbackResult?.ok) {
    throw new Error(
      fallbackResult?.error || '클립보드에 복사하지 못했습니다.'
    );
  }
}

downloadBtn.addEventListener('click', async () => {
  clearMessages();
  setButtonsDisabled(true);
  try {
    const { tabId, markdown, title } = await extractMarkdown();
    await triggerPageDownload(tabId, markdown, title);
    showStatus('다운로드 완료!');
  } catch (err) {
    console.error(err);
    showError(err?.message);
  } finally {
    setButtonsDisabled(false);
  }
});

copyBtn.addEventListener('click', async () => {
  clearMessages();
  setButtonsDisabled(true);
  try {
    const { tabId, markdown } = await extractMarkdown();
    await copyToClipboard(markdown, tabId);
    showStatus('클립보드에 복사 완료!');
  } catch (err) {
    console.error(err);
    showError(err?.message);
  } finally {
    setButtonsDisabled(false);
  }
});
