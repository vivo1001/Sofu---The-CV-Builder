import { escapeLatex as esc, escapeUrl, fillTemplate } from './latex.js';

// ---------------- English (MIT format) ----------------

const EN_TEMPLATE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[T1]{fontenc}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{graphicx}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage{fancyhdr}
\usepackage{tabularx}
\usepackage{hyphenat}
\usepackage{fontawesome}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}
\setlength{\footskip}{12pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.6in}
\addtolength{\textheight}{1.2in}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-2pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-2pt}]

\pdfgentounicode=1

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      {\small#3} & {\small #4} \\
    \end{tabular*}
}

\newcommand{\resumeProjectHeading}[2]{
    \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-5pt}
}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}, itemsep=6pt, parsep=0pt, topsep=4pt]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}[itemsep=2pt, parsep=0pt, topsep=4pt]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-2pt}}

\begin{document}

\begin{center}
    \textbf{\Huge \scshape {{NAME}}} \\ \vspace{4pt}
    \small
    \faMobile \hspace{.5pt} {{PHONE}}
    \hspace{2pt} $|$ \hspace{2pt}
    {{LOCATION}}
    \\ \vspace{2pt}
    \faAt \hspace{.5pt} {{EMAIL}}
    \hspace{2pt} $|$ \hspace{2pt}
    \faLinkedinSquare \hspace{.5pt} {{LINKEDIN}}
\end{center}

\vspace{2pt}
{{SECTIONS}}
\end{document}
`;

const enBullets = (items) => {
  const rows = items.filter((b) => b.trim());
  if (!rows.length) return '';
  return `
  \\resumeItemListStart
${rows.map((b) => `    \\resumeItem{${esc(b)}}`).join('\n')}
  \\resumeItemListEnd`;
};

function enSection(title, body) {
  if (!body.trim()) return '';
  return `
\\section{${esc(title)}}
\\resumeSubHeadingListStart
${body}
\\resumeSubHeadingListEnd
`;
}

function buildEnglish(data) {
  const education = data.education
    .filter((e) => e.school.trim())
    .map(
      (e) =>
        `  \\resumeSubheading{${esc(e.school)}}{${esc(e.location)}}{${esc(e.degree)}}{\\textit{${esc(e.dates)}}}`
    )
    .join('\n');

  const experience = data.experience
    .filter((e) => e.position.trim() || e.company.trim())
    .map(
      (e) =>
        `  \\resumeProjectHeading{\\textbf{\\large ${esc(e.position)},} \\textit{${esc(e.company)}}}{\\textit{\\small ${esc(e.dates)}}}
  \\\\${enBullets(e.bullets)}`
    )
    .join('\n\n');

  const projects = data.projects
    .filter((p) => p.title.trim())
    .map(
      (p) =>
        `  \\resumeProjectHeading{\\textbf{\\large ${esc(p.title)}${p.context.trim() ? `,} \\textit{${esc(p.context)}` : ''}}}{\\textit{\\small ${esc(p.dates)}}}
  \\\\${enBullets(p.bullets)}`
    )
    .join('\n\n');

  const skillRows = data.skills.filter((s) => s.category.trim() && s.items.trim());
  const skills = skillRows.length
    ? `  \\small{\\item{
  \\begin{itemize}[itemsep=2pt, parsep=0pt, topsep=3pt]
${skillRows.map((s) => `      \\item \\textbf{${esc(s.category)}:}{ ${esc(s.items)}}`).join('\n')}
  \\end{itemize}
  }}`
    : '';

  const sections =
    enSection('Education', education) +
    enSection('Work Experience', experience) +
    enSection('Academic Projects', projects) +
    enSection('Skills', skills);

  const tex = fillTemplate(EN_TEMPLATE, {
    NAME: esc(data.name),
    PHONE: esc(data.phone),
    LOCATION: esc(data.location),
    EMAIL: esc(data.email),
    LINKEDIN: esc(data.linkedin),
    SECTIONS: sections,
  });
  return { tex, files: [], engine: 'pdflatex' };
}

// ---------------- Deutsch (sidebar Lebenslauf) ----------------
// texlive.net only accepts text files (its CGI normalizes line endings), so
// images travel as base64 text and a lua script decodes them back to binary at
// compile time (engine switches to lualatex when any image is set).

const decodeLua = (pairs) => `local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function dec(src,dst)
  local h=io.open(src,'r')
  local data=h:read('*a'):gsub('[^A-Za-z0-9+/]','')
  h:close()
  local bits=data:gsub('.',function(x)
    local r,f='',(b:find(x)-1)
    for i=6,1,-1 do r=r..(f%2^i-f%2^(i-1)>0 and '1' or '0') end
    return r
  end)
  local out={}
  for chunk in bits:gmatch('%d%d%d%d%d%d%d%d') do
    local c=0
    for i=1,8 do c=c*2+(chunk:sub(i,i)=='1' and 1 or 0) end
    out[#out+1]=string.char(c)
  end
  local f=io.open(dst,'wb')
  f:write(table.concat(out))
  f:close()
end
${pairs.map(([src, dst]) => `dec('${src}','${dst}')`).join('\n')}
`;

const b64File = (dataUrl) => dataUrl.split(',')[1].replace(/(.{76})/g, '$1\n');

const DE_TEMPLATE = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage[a4paper,
left=7.2cm,
right=1.5cm,
top=1.8cm,
bottom=2cm]{geometry}

\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[english,ngerman]{babel}

\usepackage{changepage}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{tikz}
\usepackage{eso-pic}
\usepackage{tabularx}
\usepackage{array}
\usepackage{titlesec}
\usepackage[hidelinks]{hyperref}
\usepackage{fontawesome5}
\usepackage{parskip}
\usepackage{enumitem}
\usepackage{ifthen}
\hypersetup{
    colorlinks=true,
    linkcolor=blue,
    urlcolor=blue
}

\definecolor{sidebarblue}{RGB}{220,232,245}

\newcommand{\cvphoto}{photo.jpg}
\newcommand{\cvsignature}{signature.png}

\AddToShipoutPictureBG*{
\begin{tikzpicture}[remember picture,overlay]
\fill[sidebarblue]
(current page.north west)
rectangle ([xshift=6.5cm]current page.south west);
\end{tikzpicture}
}

\titleformat{\section}
{\Large\bfseries}
{}
{0pt}
{}
[\titlerule]

\titlespacing*{\section}
{0pt}{12pt}{8pt}

\newcommand{\cventry}[4]
{
\vspace{0.8em}

\begin{tabularx}{\textwidth}{p{3.5cm}X}
\textbf{#1}
&
\textbf{#2}
\\[0.2em]
&
\textit{#3}
\\[0.5em]
&
\begin{minipage}[t]{0.95\linewidth}
#4
\end{minipage}
\end{tabularx}

\vspace{0.1em}
}

\newcommand{\skillentry}[2]{%
    \begin{tabularx}{\textwidth}{@{} p{5cm} X @{}}
        \textbf{#1} & #2
    \end{tabularx}\par
}

\newcommand{\switchtonormalpages}{
\vfill
\clearpage
\newgeometry{
left=2cm,
right=1.5cm,
top=1.8cm,
bottom=2cm
}
}

\setlist[itemize]{
leftmargin=1.2em,
topsep=2pt,
itemsep=1pt,
parsep=0pt,
partopsep=0pt
}

{{PHOTOSETUP}}
\begin{document}

\begin{tikzpicture}[remember picture,overlay]
\node[
anchor=north west,
inner sep=0pt
]
at ([xshift=0.6cm,yshift=-0.8cm]current page.north west)
{
\begin{minipage}[t]{5.2cm}
\centering
\IfFileExists{\cvphoto}{%
    \includegraphics[width=4cm,height=5cm]{\cvphoto}%
}{%
    \fbox{\parbox[c][5cm][c]{3.8cm}{\centering Foto\\einf\"ugen\\\texttt{(photo.jpg)}}}%
}

\vspace{0.6cm}

{\fontsize{22}{24}\selectfont\bfseries {{FIRSTNAME}}}\\
\vspace{0.2cm}
{\fontsize{22}{24}\selectfont\bfseries {{LASTNAME}}}

\vspace{0.3cm}

{\fontsize{15}{18}\selectfont\bfseries Lebenslauf}

\raggedright
\vspace{0.5cm}

{\large\bfseries Pers\"onliche Daten}

\vspace{0.4cm}

\textbf{Geburtsdatum}\\
{{BIRTHDATE}}

\vspace{0.8cm}

{\large\bfseries Kontakt}

\vspace{0.4cm}

\faPhone\ {{PHONE}}

\vspace{0.25cm}

\faEnvelope\ \href{mailto:{{EMAILRAW}}}{{{EMAIL}}}

\vspace{0.25cm}

\faMapMarker*\ {{LOCATION}}

\vspace{0.25cm}

\faLinkedin\ \href{https://{{LINKEDINRAW}}}{{{LINKEDIN}}}

\vspace{0.8cm}

{\large\bfseries Sprachkenntnisse}

\vspace{0.4cm}

{{LANGUAGES}}

\end{minipage}
};
\end{tikzpicture}

{{EDUCATION}}
{{EXPERIENCE}}
\switchtonormalpages
{{PROJECTS}}
{{SKILLS}}
{{HOBBIES}}
\vfill

\vspace{0.4cm}
{{CITY}}, \today

\IfFileExists{\cvsignature}{%
    \includegraphics[height=2cm]{\cvsignature}%
}{%
    \vspace{2cm}%
}

\vspace{-0.5cm}

\rule{5cm}{0.4pt}

{{FULLNAME}}

\end{document}
`;

const deItemize = (items) => {
  const rows = items.filter((b) => b.trim());
  if (!rows.length) return '';
  return `\\begin{itemize}
${rows.map((b) => `\\item {${esc(b)}}`).join('\n')}
\\end{itemize}`;
};

// titles are our own LaTeX constants, not user input — no escaping
const deSection = (title, body) => (body.trim() ? `\\section{${title}}\n${body}\n` : '');

const cventry = (dates, title, subtitle, desc) =>
  `\\cventry
{${esc(dates)}}
{${esc(title)}}
{${esc(subtitle)}}
{${desc}}`;

function buildDeutsch(data) {
  const [firstName, ...rest] = data.name.trim().split(/\s+/);
  const lastName = rest.join(' ');

  const files = [];
  const decodePairs = [];
  if (data.photo) {
    files.push({ name: 'photo.b64', contents: b64File(data.photo) });
    decodePairs.push(['photo.b64', 'photo.jpg']);
  }
  if (data.signature) {
    files.push({ name: 'signature.b64', contents: b64File(data.signature) });
    decodePairs.push(['signature.b64', 'signature.png']);
  }
  let engine = 'pdflatex';
  let photosetup = '';
  if (decodePairs.length) {
    files.push({ name: 'd64.lua', contents: decodeLua(decodePairs) });
    engine = 'lualatex';
    photosetup = '\\directlua{dofile("d64.lua")}';
  }

  const education = data.education
    .filter((e) => e.school.trim())
    .map((e) => {
      const parts = [];
      if (e.grade.trim()) parts.push(`Note: ${esc(e.grade)}`);
      const items = deItemize(e.bullets);
      if (items) parts.push(items);
      return cventry(
        e.dates,
        e.degree,
        [e.school, e.location].filter((x) => x.trim()).join(', '),
        parts.join('\n\\\\[0.2em]\n')
      );
    })
    .join('\n\n');

  const experience = data.experience
    .filter((e) => e.position.trim() || e.company.trim())
    .map((e) => cventry(e.dates, e.position, e.company, deItemize(e.bullets)))
    .join('\n\n');

  const projects = data.projects
    .filter((p) => p.title.trim())
    .map((p) => cventry(p.dates, p.title, p.context, deItemize(p.bullets)))
    .join('\n\n');

  const skills = data.skills
    .filter((s) => s.category.trim() && s.items.trim())
    .map((s) => `\\skillentry\n{${esc(s.category)}}\n{${esc(s.items)}}`)
    .join('\n\n');

  const languages = data.languages
    .filter((l) => l.trim())
    .map((l) => esc(l))
    .join('\n\n\\vspace{0.2cm}\n\n');

  const tex = fillTemplate(DE_TEMPLATE, {
    PHOTOSETUP: photosetup,
    FIRSTNAME: esc(firstName ?? ''),
    LASTNAME: esc(lastName),
    FULLNAME: esc(data.name),
    BIRTHDATE: esc(data.birthdate),
    PHONE: esc(data.phone),
    EMAIL: esc(data.email),
    EMAILRAW: escapeUrl(data.email), // inside \href URL argument: percent-encoded
    LOCATION: esc(data.location),
    LINKEDIN: esc(data.linkedin),
    LINKEDINRAW: escapeUrl(data.linkedin.replace(/^https?:\/\//, '')),
    LANGUAGES: languages,
    EDUCATION: deSection('Ausbildung', education),
    EXPERIENCE: deSection('Berufserfahrung', experience),
    PROJECTS: deSection('Projekte', projects),
    SKILLS: deSection('Kenntnisse \\& F\\"ahigkeiten', skills),
    HOBBIES: data.hobbies.trim()
      ? `\\section{Hobbys \\& Interessen}\n${esc(data.hobbies)}\n`
      : '',
    CITY: esc(data.location.split(',')[0]),
  });

  return { tex, files, engine };
}

// ---------------- public API ----------------

export const TEMPLATES = {
  english: {
    name: 'English (MIT format)',
    labels: {
      education: 'Education',
      experience: 'Work Experience',
      projects: 'Academic Projects',
      skills: 'Skills',
    },
    build: buildEnglish,
  },
  deutsch: {
    name: 'Deutsch (Lebenslauf)',
    // UI-only labels (English); the PDF section titles stay German in deSection()
    labels: {
      education: 'Education',
      experience: 'Work Experience',
      projects: 'Projects',
      skills: 'Skills & Abilities',
    },
    build: buildDeutsch,
  },
};

export const buildTex = (data, templateId) => TEMPLATES[templateId].build(data);

export const EMPTY_DATA = {
  name: '',
  phone: '',
  location: '',
  email: '',
  linkedin: '',
  photo: '', // jpeg data URL, canvas-downscaled
  signature: '', // png data URL, keeps transparency
  birthdate: '',
  hobbies: '',
  languages: [''],
  education: [{ school: '', location: '', degree: '', dates: '', grade: '', bullets: [''] }],
  experience: [{ position: '', company: '', dates: '', bullets: [''] }],
  projects: [{ title: '', context: '', dates: '', bullets: [''] }],
  skills: [{ category: '', items: '' }],
};
