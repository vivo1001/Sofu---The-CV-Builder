import { useEffect, useRef, useState } from 'react';
import { TEMPLATES, EMPTY_DATA, buildTex } from './templates.js';
import { compileToPdf, downloadBlob } from './latex.js';
import './App.css';

const STORAGE_KEY = 'cv-builder';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const data = { ...EMPTY_DATA, ...saved };
    // older saves lack the deutsch-only education fields
    data.education = data.education.map((e) => ({ grade: '', bullets: [''], ...e }));
    return data;
  } catch {
    return EMPTY_DATA;
  }
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [templateId, setTemplateId] = useState(null);
  const [data, setData] = useState(load);
  const [status, setStatus] = useState(null); // null | 'compiling' | 'done' | {error}

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // vanta.js birds background; mounted once, shared by all screens.
  // three.js + vanta load via dynamic import so they stay off the critical path —
  // the app renders instantly and the birds fade in when their chunk arrives.
  const bgRef = useRef(null);
  const [bgReady, setBgReady] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let effect;
    let cancelled = false;
    Promise.all([import('three'), import('vanta/src/vanta.birds.js')]).then(
      ([THREE, { default: BIRDS }]) => {
        if (cancelled) return;
        effect = BIRDS({
          el: bgRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          backgroundColor: 0xf4f5fb,
          color1: 0x4f46e5,
          color2: 0x7c3aed,
          colorMode: 'lerpGradient',
          birdSize: 1.2,
          quantity: 4,
          speedLimit: 4,
        });
        setBgReady(true);
      }
    );
    return () => {
      cancelled = true;
      effect?.destroy();
    };
  }, []);

  const wash = (
    <div
      ref={bgRef}
      className={'vanta-bg' + (bgReady ? ' ready' : '') + (started && templateId ? ' dim' : '')}
      aria-hidden="true"
    />
  );

  const set = (field) => (e) => setData({ ...data, [field]: e.target.value });

  const setEntry = (listKey, i, field, value) => {
    const list = data[listKey].map((entry, j) =>
      j === i ? { ...entry, [field]: value } : entry
    );
    setData({ ...data, [listKey]: list });
  };
  const addEntry = (listKey, blank) =>
    setData({ ...data, [listKey]: [...data[listKey], blank] });
  const removeEntry = (listKey, i) =>
    setData({ ...data, [listKey]: data[listKey].filter((_, j) => j !== i) });

  // downscale: texlive.net rejects requests over 1 MB; png for the signature keeps transparency
  const loadImage = (field, maxW, maxH, mime) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      setData((d) => ({ ...d, [field]: c.toDataURL(mime, 0.85) }));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  };

  async function download() {
    setStatus('compiling');
    try {
      const { tex, files, engine } = buildTex(data, templateId);
      const pdf = await compileToPdf(tex, files, engine);
      downloadBlob(pdf, `CV_${data.name.replace(/\s+/g, '_') || 'resume'}.pdf`);
      setStatus(null);
      setFinished(true);
    } catch (err) {
      setStatus({ error: err.message });
    }
  }

  // ponytail: free MyMemory API, no key — ~5000 chars/day per IP; swap in DeepL if users hit the cap
  async function toGerman(text) {
    if (!text?.trim()) return text;
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|de`
    );
    const json = await res.json();
    if (!res.ok || !json.responseData?.translatedText) throw new Error('Translation service unavailable');
    return json.responseData.translatedText;
  }

  async function translateAll() {
    setStatus('translating');
    try {
      const all = (xs) => Promise.all(xs);
      const d = { ...data };
      d.education = await all(data.education.map(async (e) => ({
        ...e, degree: await toGerman(e.degree), bullets: await all(e.bullets.map(toGerman)),
      })));
      d.experience = await all(data.experience.map(async (e) => ({
        ...e, position: await toGerman(e.position), bullets: await all(e.bullets.map(toGerman)),
      })));
      d.projects = await all(data.projects.map(async (e) => ({
        ...e, title: await toGerman(e.title), context: await toGerman(e.context), bullets: await all(e.bullets.map(toGerman)),
      })));
      d.skills = await all(data.skills.map(async (s) => ({
        ...s, category: await toGerman(s.category), items: await toGerman(s.items),
      })));
      d.languages = await all(data.languages.map(toGerman));
      d.hobbies = await toGerman(data.hobbies);
      setData(d);
      setStatus(null);
    } catch (err) {
      setStatus({ error: 'Translation failed: ' + err.message });
    }
  }

  const [finished, setFinished] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackState, setFeedbackState] = useState(null); // null | 'sent' | 'error'
  // ponytail: Netlify Forms — POST to / only works on the deployed site, not `vite dev`
  async function sendFeedback(e) {
    e.preventDefault();
    if (!feedback.trim()) return;
    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'form-name': 'feedback', message: feedback }),
      });
      if (!res.ok) throw new Error();
      setFeedbackState('sent');
    } catch {
      setFeedbackState('error');
    }
  }

  // ponytail: manual refresh, not live — each compile is a multi-second remote
  // texlive.net call; debounced auto-compile if a local LaTeX/WASM engine lands
  const [previewUrl, setPreviewUrl] = useState(null);
  async function refreshPreview() {
    setStatus('compiling');
    try {
      const { tex, files, engine } = buildTex(data, templateId);
      const pdf = await compileToPdf(tex, files, engine);
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(pdf);
      });
      setStatus(null);
    } catch (err) {
      setStatus({ error: err.message });
    }
  }

  if (!started) {
    return (
      <>
      {wash}
      <main className="welcome screen">
        <p className="welcome-hello">Hi there, welcome to</p>
        <h1 className="welcome-title">Sofu</h1>
        <p className="welcome-tag">the CV builder</p>
        <p className="welcome-sub">
          Pick a format, fill in your details, and download a polished PDF —
          typeset with real LaTeX.
        </p>
        <button className="primary cta" onClick={() => setStarted(true)}>
          Get started →
        </button>
        <p className="credit">Created with <span className="heart">❤</span> from Centrumplatz</p>
      </main>
      </>
    );
  }

  if (!templateId) {
    return (
      <>
      {wash}
      <main className="picker screen">
        <h1>Choose your format</h1>
        <div className="cards">
          <button className="card" onClick={() => setTemplateId('english')}>
            <span className="card-icon">EN</span>
            {/* ponytail: hand-drawn layout sketch, swap for real screenshots if templates change often */}
            <svg className="card-preview" viewBox="0 0 120 168" aria-hidden="true">
              <rect width="120" height="168" fill="#fff" />
              <rect x="30" y="12" width="60" height="7" rx="2" fill="#444" />
              <rect x="24" y="24" width="72" height="3" rx="1.5" fill="#aaa" />
              {[36, 78, 120].map((y) => (
                <g key={y}>
                  <rect x="12" y={y} width="40" height="4" rx="2" fill="#4f46e5" />
                  <rect x="12" y={y + 8} width="96" height="1.5" fill="#ddd" />
                  <rect x="12" y={y + 14} width="96" height="3" rx="1.5" fill="#bbb" />
                  <rect x="12" y={y + 20} width="88" height="3" rx="1.5" fill="#ccc" />
                  <rect x="12" y={y + 26} width="92" height="3" rx="1.5" fill="#ccc" />
                </g>
              ))}
            </svg>
            <strong>{TEMPLATES.english.name}</strong>
            <small>Classic single-column resume</small>
          </button>
          <button className="card" onClick={() => setTemplateId('deutsch')}>
            <span className="card-icon">DE</span>
            <svg className="card-preview" viewBox="0 0 120 168" aria-hidden="true">
              <rect width="120" height="168" fill="#fff" />
              <rect width="42" height="168" fill="#e8e7f7" />
              <circle cx="21" cy="26" r="13" fill="#7c3aed" />
              {[52, 60, 68, 84, 92, 100, 116, 124].map((y) => (
                <rect key={y} x="8" y={y} width="26" height="3" rx="1.5" fill="#9a94c9" />
              ))}
              <rect x="52" y="14" width="48" height="6" rx="2" fill="#444" />
              {[34, 82].map((y) => (
                <g key={y}>
                  <rect x="52" y={y} width="34" height="4" rx="2" fill="#4f46e5" />
                  <rect x="52" y={y + 10} width="56" height="3" rx="1.5" fill="#bbb" />
                  <rect x="52" y={y + 16} width="50" height="3" rx="1.5" fill="#ccc" />
                  <rect x="52" y={y + 22} width="54" height="3" rx="1.5" fill="#ccc" />
                  <rect x="52" y={y + 28} width="46" height="3" rx="1.5" fill="#ccc" />
                </g>
              ))}
              <path d="M52 148 q10 -10 18 0 t18 -2" stroke="#666" strokeWidth="1.5" fill="none" />
            </svg>
            <strong>{TEMPLATES.deutsch.name}</strong>
            <small>Sidebar Lebenslauf with photo &amp; signature</small>
          </button>
        </div>
      </main>
      </>
    );
  }

  if (finished) {
    return (
      <>
      {wash}
      <main className="welcome screen">
        <h1 className="welcome-title">Thank you!</h1>
        <p className="welcome-sub">
          Thanks for using Sofu — your CV is on its way to your downloads folder.
          Good luck with the applications!
        </p>
        {feedbackState === 'sent' ? (
          <p className="welcome-sub">✓ Feedback received — thank you!</p>
        ) : (
          <form className="feedback" onSubmit={sendFeedback}>
            <textarea
              placeholder="Spotted an error or have a suggestion? Tell us here…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <button className="primary" type="submit">Send feedback</button>
            {feedbackState === 'error' && (
              <p className="error">Couldn’t send feedback — please try again later.</p>
            )}
          </form>
        )}
        <button onClick={() => { setFinished(false); setFeedbackState(null); setFeedback(''); }}>
          ← Back to the editor
        </button>
      </main>
      </>
    );
  }

  return (
    <>
    {wash}
    <main className={'screen' + (previewUrl ? ' with-preview' : '')}>
      <header className="topbar">
        <h1>Sofu — {TEMPLATES[templateId].name}</h1>
        <div>
          {templateId === 'deutsch' && (
            <button disabled={status === 'translating'} onClick={translateAll}>
              Translate to German
            </button>
          )}
          <button disabled={status === 'compiling'} onClick={refreshPreview}>
            {previewUrl ? '↻ Refresh preview' : 'Preview'}
          </button>
          <button onClick={() => setTemplateId(null)}>Change format</button>
        </div>
      </header>

      <section>
        <h2>Personal Info</h2>
        <div className="grid">
          <input placeholder="Full name" value={data.name} onChange={set('name')} />
          <input placeholder="Phone (+49 ...)" value={data.phone} onChange={set('phone')} />
          <input placeholder="City, Region, Country" value={data.location} onChange={set('location')} />
          <input placeholder="Email" value={data.email} onChange={set('email')} />
          <input placeholder="linkedin.com/in/username" value={data.linkedin} onChange={set('linkedin')} />
          {templateId === 'deutsch' && (
            <input placeholder="Date of birth (DD.MM.YYYY)" value={data.birthdate} onChange={set('birthdate')} />
          )}
        </div>
        {templateId === 'deutsch' && (
          <>
            <div className="photo-row">
              <label>
                Photo: <input type="file" accept="image/*" onChange={loadImage('photo', 480, 600, 'image/jpeg')} />
              </label>
              {data.photo && (
                <>
                  <img className="photo-preview" src={data.photo} alt="Application photo" />
                  <button onClick={() => setData({ ...data, photo: '' })}>Remove photo</button>
                </>
              )}
            </div>
            <div className="photo-row">
              <label>
                Signature: <input type="file" accept="image/*" onChange={loadImage('signature', 600, 240, 'image/png')} />
              </label>
              {data.signature && (
                <>
                  <img className="signature-preview" src={data.signature} alt="Signature" />
                  <button onClick={() => setData({ ...data, signature: '' })}>Remove</button>
                </>
              )}
            </div>
          </>
        )}
      </section>

      <section>
        <h2>{TEMPLATES[templateId].labels.education}</h2>
        {data.education.map((e, i) => (
          <div className="entry" key={i}>
            <div className="grid">
              <input placeholder="University" value={e.school} onChange={(ev) => setEntry('education', i, 'school', ev.target.value)} />
              <input placeholder="City, Country" value={e.location} onChange={(ev) => setEntry('education', i, 'location', ev.target.value)} />
              <input placeholder="Degree and program" value={e.degree} onChange={(ev) => setEntry('education', i, 'degree', ev.target.value)} />
              <input placeholder="Mon. YYYY -- Mon. YYYY" value={e.dates} onChange={(ev) => setEntry('education', i, 'dates', ev.target.value)} />
              {templateId === 'deutsch' && (
                <input placeholder="Grade (e.g. 1,7)" value={e.grade} onChange={(ev) => setEntry('education', i, 'grade', ev.target.value)} />
              )}
            </div>
            {templateId === 'deutsch' && (
              <>
                {e.bullets.map((b, bi) => (
                  <div className="bullet" key={bi}>
                    <input
                      placeholder="Detail: focus areas, thesis …"
                      value={b}
                      onChange={(ev) =>
                        setEntry('education', i, 'bullets', e.bullets.map((x, xj) => (xj === bi ? ev.target.value : x)))
                      }
                    />
                    <button onClick={() => setEntry('education', i, 'bullets', e.bullets.filter((_, xj) => xj !== bi))}>×</button>
                  </div>
                ))}
                <button onClick={() => setEntry('education', i, 'bullets', [...e.bullets, ''])}>+ Detail</button>
              </>
            )}
            <button className="remove" onClick={() => removeEntry('education', i)}>Remove</button>
          </div>
        ))}
        <button onClick={() => addEntry('education', { school: '', location: '', degree: '', dates: '', grade: '', bullets: [''] })}>+ Add education</button>
      </section>

      {['experience', 'projects'].map((key) => (
        <section key={key}>
          <h2>{TEMPLATES[templateId].labels[key]}</h2>
          {data[key].map((e, i) => (
            <div className="entry" key={i}>
              <div className="grid">
                {key === 'experience' ? (
                  <>
                    <input placeholder="Position" value={e.position} onChange={(ev) => setEntry(key, i, 'position', ev.target.value)} />
                    <input placeholder="Company, City" value={e.company} onChange={(ev) => setEntry(key, i, 'company', ev.target.value)} />
                  </>
                ) : (
                  <>
                    <input placeholder="Project title" value={e.title} onChange={(ev) => setEntry(key, i, 'title', ev.target.value)} />
                    <input placeholder="Institution or context (optional)" value={e.context} onChange={(ev) => setEntry(key, i, 'context', ev.target.value)} />
                  </>
                )}
                <input placeholder="Mon. YYYY -- Mon. YYYY" value={e.dates} onChange={(ev) => setEntry(key, i, 'dates', ev.target.value)} />
              </div>
              {e.bullets.map((b, bi) => (
                <div className="bullet" key={bi}>
                  <input
                    placeholder="Bullet: action verb + result"
                    value={b}
                    onChange={(ev) =>
                      setEntry(key, i, 'bullets', e.bullets.map((x, xj) => (xj === bi ? ev.target.value : x)))
                    }
                  />
                  <button onClick={() => setEntry(key, i, 'bullets', e.bullets.filter((_, xj) => xj !== bi))}>×</button>
                </div>
              ))}
              <button onClick={() => setEntry(key, i, 'bullets', [...e.bullets, ''])}>+ Bullet</button>
              <button className="remove" onClick={() => removeEntry(key, i)}>Remove</button>
            </div>
          ))}
          <button onClick={() => addEntry(key, key === 'experience'
            ? { position: '', company: '', dates: '', bullets: [''] }
            : { title: '', context: '', dates: '', bullets: [''] })}>
            + Add entry
          </button>
        </section>
      ))}

      <section>
        <h2>{TEMPLATES[templateId].labels.skills}</h2>
        {data.skills.map((s, i) => (
          <div className="entry" key={i}>
            <div className="grid">
              <input placeholder="Category (e.g. Programming)" value={s.category} onChange={(ev) => setEntry('skills', i, 'category', ev.target.value)} />
              <input placeholder="Comma-separated items" value={s.items} onChange={(ev) => setEntry('skills', i, 'items', ev.target.value)} />
            </div>
            <button className="remove" onClick={() => removeEntry('skills', i)}>Remove</button>
          </div>
        ))}
        <button onClick={() => addEntry('skills', { category: '', items: '' })}>+ Add skill group</button>
      </section>

      {templateId === 'deutsch' && (
        <>
          <section>
            <h2>Languages</h2>
            {data.languages.map((l, i) => (
              <div className="bullet" key={i}>
                <input
                  placeholder="Language — level (e.g. Deutsch — C1)"
                  value={l}
                  onChange={(ev) =>
                    setData({ ...data, languages: data.languages.map((x, j) => (j === i ? ev.target.value : x)) })
                  }
                />
                <button onClick={() => setData({ ...data, languages: data.languages.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <button onClick={() => setData({ ...data, languages: [...data.languages, ''] })}>+ Language</button>
          </section>

          <section>
            <h2>Hobbies &amp; Interests</h2>
            <input placeholder="Hobby 1, Hobby 2, Hobby 3" value={data.hobbies} onChange={set('hobbies')} />
          </section>
        </>
      )}

      <footer>
        <button className="primary" disabled={status === 'compiling'} onClick={download}>
          {status === 'compiling' ? 'Compiling…' : 'Download PDF'}
        </button>
        {status?.error && <pre className="error">{status.error}</pre>}
      </footer>

      {(status === 'compiling' || status === 'translating') && (
        <div className="overlay">
          <div className="spinner" />
          <p className="overlay-text">
            {status === 'compiling' ? 'Typesetting your CV with LaTeX…' : 'Translating your CV to German…'}
          </p>
          <p className="overlay-hint">this usually takes a few seconds</p>
        </div>
      )}
    </main>
    {previewUrl && (
      <aside className="preview-pane">
        <div className="preview-bar">
          <span>Preview</span>
          <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>× Close</button>
        </div>
        <iframe src={previewUrl} title="CV preview" />
      </aside>
    )}
    </>
  );
}
