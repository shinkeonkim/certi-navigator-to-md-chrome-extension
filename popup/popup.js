const downloadBtn = document.getElementById('downloadBtn');
const copyBtn = document.getElementById('copyBtn');
const saveToFolderBtn = document.getElementById('saveToFolderBtn');
const pickFolderBtn = document.getElementById('pickFolderBtn');
const clearFolderBtn = document.getElementById('clearFolderBtn');
const folderNameEl = document.getElementById('folderName');
const filenameInput = document.getElementById('filenameInput');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');

const DEFAULT_ERROR =
  '해당 페이지에서 실행할 수 없거나 오류가 발생했습니다.';
const DB_NAME = 'certi-md-extension';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const DIR_KEY = 'directoryHandle';

const ALL_BUTTONS = [
  downloadBtn,
  copyBtn,
  saveToFolderBtn,
  pickFolderBtn,
  clearFolderBtn,
];

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
  for (const btn of ALL_BUTTONS) {
    if (btn) btn.disabled = disabled;
  }
  if (filenameInput) filenameInput.disabled = disabled;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbSet(key, value) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(key) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const loadDirHandle = () => idbGet(DIR_KEY);
const saveDirHandle = (handle) => idbSet(DIR_KEY, handle);
const clearStoredDirHandle = () => idbDelete(DIR_KEY);

async function ensureRWPermission(handle) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

function buildFilename(title) {
  const maxFilenameLen = 30;
  let safeTitle = title
    .split('\n')[0]
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();
  if (safeTitle.length > maxFilenameLen) {
    safeTitle = safeTitle.substring(0, maxFilenameLen) + '...';
  }
  return `${safeTitle}.md`;
}

function buildFilenameFromInput(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  let safe = trimmed
    .split('\n')[0]
    .replace(/[/\\?%*:|"<>]/g, '-')
    .trim();
  if (!safe) return null;

  if (!safe.toLowerCase().endsWith('.md')) {
    safe += '.md';
  }
  return safe;
}

function resolveTargetFilename(title) {
  return buildFilenameFromInput(filenameInput?.value) || buildFilename(title);
}

function timestampSuffix() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

async function fileExists(dirHandle, name) {
  try {
    await dirHandle.getFileHandle(name, { create: false });
    return true;
  } catch (err) {
    if (err && err.name === 'NotFoundError') return false;
    throw err;
  }
}

async function resolveFilename(dirHandle, baseName) {
  if (!(await fileExists(dirHandle, baseName))) return baseName;

  const dotIndex = baseName.lastIndexOf('.');
  const stem = dotIndex >= 0 ? baseName.slice(0, dotIndex) : baseName;
  const ext = dotIndex >= 0 ? baseName.slice(dotIndex) : '';

  let candidate = `${stem}-${timestampSuffix()}${ext}`;
  let counter = 1;
  while (await fileExists(dirHandle, candidate)) {
    candidate = `${stem}-${timestampSuffix()}-${counter}${ext}`;
    counter++;
    if (counter > 100) break;
  }
  return candidate;
}

async function writeFile(dirHandle, filename, content) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
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

function triggerPageDownload(tabId, markdown, filename) {
  return chrome.scripting.executeScript({
    target: { tabId },
    func: (md, fn) => {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fn;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    args: [markdown, filename],
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
    func: async (md) => {
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

async function refreshFolderUI() {
  let handle = null;
  try {
    handle = await loadDirHandle();
  } catch (err) {
    console.warn('Failed to load directory handle:', err);
  }

  if (handle) {
    folderNameEl.textContent = handle.name;
    folderNameEl.classList.remove('unset');
    clearFolderBtn.hidden = false;
    pickFolderBtn.textContent = '폴더 변경';
  } else {
    folderNameEl.textContent = '설정 안 됨';
    folderNameEl.classList.add('unset');
    clearFolderBtn.hidden = true;
    pickFolderBtn.textContent = '폴더 선택';
  }
}

async function pickAndStoreDirectory() {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error(
      '이 브라우저는 디렉토리 선택을 지원하지 않습니다. (Chrome/Edge 최신 버전 필요)'
    );
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await saveDirHandle(handle);
  return handle;
}

downloadBtn.addEventListener('click', async () => {
  clearMessages();
  setButtonsDisabled(true);
  try {
    const { tabId, markdown, title } = await extractMarkdown();
    const filename = resolveTargetFilename(title);
    await triggerPageDownload(tabId, markdown, filename);
    showStatus(`'${filename}' 다운로드 완료!`);
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

saveToFolderBtn.addEventListener('click', async () => {
  clearMessages();
  setButtonsDisabled(true);
  try {
    let dirHandle = await loadDirHandle();

    if (!dirHandle) {
      try {
        dirHandle = await pickAndStoreDirectory();
        await refreshFolderUI();
      } catch (err) {
        if (err?.name === 'AbortError') return;
        throw err;
      }
    }

    if (!(await ensureRWPermission(dirHandle))) {
      showError('폴더 쓰기 권한이 거부되었습니다.');
      return;
    }

    const { markdown, title } = await extractMarkdown();
    const baseName = resolveTargetFilename(title);
    const finalName = await resolveFilename(dirHandle, baseName);
    await writeFile(dirHandle, finalName, markdown);

    showStatus(`'${finalName}' 저장 완료 (${dirHandle.name})`);
  } catch (err) {
    console.error(err);
    showError(err?.message);
  } finally {
    setButtonsDisabled(false);
  }
});

pickFolderBtn.addEventListener('click', async () => {
  clearMessages();
  setButtonsDisabled(true);
  try {
    const handle = await pickAndStoreDirectory();
    await refreshFolderUI();
    showStatus(`저장 폴더가 '${handle.name}'(으)로 설정되었습니다.`);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error(err);
    showError(err?.message);
  } finally {
    setButtonsDisabled(false);
  }
});

clearFolderBtn.addEventListener('click', async () => {
  clearMessages();
  setButtonsDisabled(true);
  try {
    await clearStoredDirHandle();
    await refreshFolderUI();
    showStatus('저장 폴더 설정이 해제되었습니다.');
  } catch (err) {
    console.error(err);
    showError(err?.message);
  } finally {
    setButtonsDisabled(false);
  }
});

refreshFolderUI();
