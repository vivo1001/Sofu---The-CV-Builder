// LaTeX helpers: escape user input, fill templates, compile via texlive.net.

const ESCAPES = [
  [/\\/g, '\\textbackslash{}'],
  [/&/g, '\\&'],
  [/%/g, '\\%'],
  [/\$/g, '\\$'],
  [/#/g, '\\#'],
  [/_/g, '\\_'],
  [/{/g, '\\{'],
  [/}/g, '\\}'],
  [/~/g, '\\textasciitilde{}'],
  [/\^/g, '\\textasciicircum{}'],
];

export function escapeLatex(str) {
  // escape backslash first, then fix the braces it introduced
  let s = String(str ?? '').replace(/\\/g, '\x00');
  for (const [re, rep] of ESCAPES.slice(1)) s = s.replace(re, rep);
  return s.replace(/\x00/g, '\\textbackslash{}');
}

// Replace every {{KEY}} in template with values[KEY] (already-built LaTeX strings).
export function fillTemplate(template, values) {
  const out = template.replace(/\{\{(\w+)\}\}/g, (m, key) =>
    key in values ? values[key] : m
  );
  const leftover = out.match(/\{\{\w+\}\}/);
  if (leftover) throw new Error(`Unfilled placeholder: ${leftover[0]}`);
  return out;
}

// ponytail: single provider (texlive.net); add latexonline.cc fallback if it proves flaky
// extraFiles: [{name, contents}] — text only, the API corrupts binary (use base64 + lua decode)
export async function compileToPdf(texString, extraFiles = [], engine = 'pdflatex') {
  const form = new FormData();
  form.append('filecontents[]', texString);
  form.append('filename[]', 'document.tex');
  for (const f of extraFiles) {
    form.append('filecontents[]', f.contents);
    form.append('filename[]', f.name);
  }
  form.append('engine', engine);
  form.append('return', 'pdf');
  const res = await fetch('/latexcgi', {
    method: 'POST',
    body: form,
  });
  const blob = await res.blob();
  if (!res.ok || blob.type !== 'application/pdf') {
    const log = await blob.text().catch(() => '');
    throw new Error('LaTeX compile failed:\n' + log.slice(-2000));
  }
  return blob;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
