/* src/*.gs 를 dist/Code.gs 한 파일로 합칩니다.
   clasp 없이 Apps Script 편집기에 붙여 넣을 때 쓰세요.  node tools/build.js */
const fs = require('fs');
const path = require('path');

const ORDER = ['Rotation.gs', 'Sheets.gs', 'Calendar.gs', 'Render.gs', 'Log.gs', 'Setup.gs', 'Menu.gs'];
const root = path.join(__dirname, '..');
const parts = ORDER.map(f => {
  const body = fs.readFileSync(path.join(root, 'src', f), 'utf8');
  return `/* ===== ${f} ===== */\n\n${body.trim()}\n`;
});

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = `/* 자동 생성 파일입니다. src/*.gs 를 고친 뒤 node tools/build.js 로 다시 만드세요. */\n\n${parts.join('\n')}`;
fs.writeFileSync(path.join(root, 'dist', 'Code.gs'), out);
console.log('dist/Code.gs 생성 (' + out.split('\n').length + ' 줄)');
