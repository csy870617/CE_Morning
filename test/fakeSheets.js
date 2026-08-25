/* 구글 시트 API 를 아주 얇게 흉내 낸 껍데기.
   시트에 붙는 코드(Setup/Sheets/Calendar/Render)를 Node 에서 한 번 돌려 보기 위한 것입니다.
   서식은 받아만 두고 버립니다. 값·메모·병합만 실제로 기억합니다. */

function makeRange(sheet, row, col, numRows, numCols) {
  const r = {
    getRow: () => row,
    getValue() { return sheet._get(row, col); },
    getValues() {
      const out = [];
      for (let i = 0; i < numRows; i++) {
        const line = [];
        for (let j = 0; j < numCols; j++) line.push(sheet._get(row + i, col + j));
        out.push(line);
      }
      return out;
    },
    setValue(v) { sheet._set(row, col, v); return r; },
    setValues(vals) {
      if (vals.length !== numRows) throw new Error(`setValues 행 수가 안 맞음: ${vals.length} vs ${numRows}`);
      for (let i = 0; i < numRows; i++) {
        if (vals[i].length !== numCols) {
          throw new Error(`setValues 열 수가 안 맞음: ${vals[i].length} vs ${numCols}`);
        }
        for (let j = 0; j < numCols; j++) sheet._set(row + i, col + j, vals[i][j]);
      }
      return r;
    },
    setNote(v) { sheet.notes.set(`${row},${col}`, v); return r; },
    merge() {
      if (numRows === 1 && numCols === 1) return r;
      sheet.merges.push({ row, col, numRows, numCols });
      return r;
    },
    breakApart() { sheet.merges = []; return r; },
    setDataValidation() { return r; }
  };
  ['setBackground', 'setFontColor', 'setFontWeight', 'setFontSize', 'setFontStyle',
   'setHorizontalAlignment', 'setWrap', 'setNumberFormat', 'setBorder'].forEach(m => { r[m] = () => r; });
  return r;
}

function makeSheet(name) {
  const sheet = {
    name,
    cells: new Map(),
    notes: new Map(),
    merges: [],
    hidden: false,
    _key: (row, col) => `${row},${col}`,
    _get(row, col) { const v = sheet.cells.get(sheet._key(row, col)); return v === undefined ? '' : v; },
    _set(row, col, v) { sheet.cells.set(sheet._key(row, col), v === undefined || v === null ? '' : v); },
    getName: () => name,
    getMaxRows: () => 1000,
    getMaxColumns: () => 26,
    getLastRow() {
      let last = 0;
      for (const [k, v] of sheet.cells) {
        if (v === '') continue;
        last = Math.max(last, Number(k.split(',')[0]));
      }
      return last;
    },
    getLastColumn() {
      let last = 0;
      for (const [k, v] of sheet.cells) {
        if (v === '') continue;
        last = Math.max(last, Number(k.split(',')[1]));
      }
      return last;
    },
    getRange(row, col, numRows, numCols) {
      return makeRange(sheet, row, col, numRows === undefined ? 1 : numRows, numCols === undefined ? 1 : numCols);
    },
    clear() { sheet.cells.clear(); sheet.notes.clear(); return sheet; },
    clearNotes() { sheet.notes.clear(); return sheet; },
    setColumnWidth: () => sheet,
    setRowHeight: () => sheet,
    setFrozenRows: () => sheet,
    setFrozenColumns: () => sheet,
    hideSheet() { sheet.hidden = true; return sheet; }
  };
  return sheet;
}

function makeSpreadsheet() {
  const sheets = [];
  return {
    sheets,
    getSpreadsheetTimeZone: () => 'America/Los_Angeles',
    getSheetByName: n => sheets.filter(s => s.name === n)[0] || null,
    insertSheet(n) { const s = makeSheet(n); sheets.push(s); return s; },
    setActiveSheet: s => s
  };
}

function makeContext() {
  const ss = makeSpreadsheet();
  return {
    ss,
    globals: {
      console,
      SpreadsheetApp: {
        getActiveSpreadsheet: () => ss,
        newDataValidation: () => ({
          requireValueInList: () => ({ setAllowInvalid: () => ({ build: () => ({}) }) })
        }),
        BorderStyle: { SOLID: 'SOLID' },
        getUi() { throw new Error('테스트에서는 UI 를 쓰지 않습니다'); }
      },
      Utilities: {
        formatDate(d, tz, fmt) {
          const p = n => String(n).padStart(2, '0');
          const iso = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
          return fmt === 'yyyy-MM-dd' ? iso : `${iso} 00:00`;
        }
      }
    }
  };
}

module.exports = { makeContext };
