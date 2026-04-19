(function extractToMarkdown() {
  function formatMarkdown() {
    let md = '';

    // 1. Extract Question
    const questionEl = document.querySelector('h1.text-lg.font-semibold') || document.querySelector('h1.text-lg.font-medium') || document.querySelector('h1.text-lg');
    if (!questionEl) {
      alert("문제 제목을 찾을 수 없습니다.");
      return null;
    }
    const questionText = questionEl.innerText.trim();
    md += `## Question\n\n${questionText}\n\n`;

    // 2. Extract Choices
    // Checkboxes (multiple) or Radios (single)
    const choiceLabels = document.querySelectorAll('label[data-slot="label"]');
    if (choiceLabels.length > 0) {
      choiceLabels.forEach(label => {
        md += `- [ ] ${label.innerText.trim()}\n`;
      });
      md += '\n';
    }

    // 3. Extract Answer & Explanation (if they exist)
    const answerEl = Array.from(document.querySelectorAll('h2.text-md.font-semibold')).find(el => el.innerText.includes('정답:')); // From a-2.html
    if (answerEl) {
      md += `## Answer\n\n${answerEl.innerText.trim()}\n\n`;

      // Extract explanations
      const explanationContainer = answerEl.parentElement;
      if (explanationContainer) {
        // all siblings of the answer element that are <p>
        const pTags = Array.from(explanationContainer.querySelectorAll('p.text-md.text-gray-700'));
        if (pTags.length > 0) {
          md += `## Explanation\n\n`;
          pTags.forEach(p => {
            md += `${p.innerText.trim()}\n\n`;
          });
        }
      }
    }

    return { markdown: md, title: questionText };
  }

  const result = formatMarkdown();
  
  if (result) {
    // Sanitize title for filename
    const maxFilenameLen = 30;
    let safeTitle = result.title.split('\\n')[0].replace(/[/\\\\?%*:|"<>]/g, '-').trim();
    if (safeTitle.length > maxFilenameLen) {
      safeTitle = safeTitle.substring(0, maxFilenameLen) + '...';
    }
    const filename = `${safeTitle}.md`;

    // Create a Blob and Download
    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }
})();
