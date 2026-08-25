/**
 * 배정 기록 (_기록 탭).
 *
 * 배정을 돌릴 때마다 그 달의 결과를 쌓아 둡니다. 이미 있는 달은 새로 갈아 끼우고
 * 다른 달의 기록은 그대로 두므로, 달을 거듭할수록 기록이 누적됩니다.
 *
 * 특히 '교대' 와 '대타' 를 남깁니다. 겹침 때문에 순서를 벗어나 세운 사람이
 * 누구였는지 나중에 확인하기 위한 것입니다.
 */

var CE_LOG_HEADERS = ['날짜', '요일', '역할', '담당', '비고', '기록시각'];

/** 한 줄의 비고를 만듭니다. */
function ceLogNote(off, gap, swapNote, warning, substitute) {
  if (off) return '휴일';
  if (gap) return '미배정 (전원 예외)';
  if (warning) return '확인 필요: ' + warning;
  if (substitute) return '대타 — ' + swapNote;
  if (swapNote) return '교대 — ' + swapNote;
  return '';
}

/** 그 달의 배정을 기록 줄로 펼칩니다. (다른 달 날짜는 뺍니다) */
function ceLogRowsForMonth(year, month, grid, sched, cfg, stamp) {
  var rows = [];
  for (var w = 0; w < grid.weeks.length; w++) {
    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = grid.weeks[w][c];
      if (!cell.inMonth) continue;
      var a = sched.byIso[cell.iso];
      if (!a) continue;

      var dowName = CE_DOW_NAMES[cell.dow];
      var special = ceSpecialSlot(cell.dow, a, cfg);

      if (a.preacher || a.offSermon || a.gapSermon) {
        rows.push([cell.iso, dowName, '설교자', a.preacher || '',
          ceLogNote(a.offSermon, a.gapSermon, '', '', false), stamp]);
      }
      if (a.broadcast || a.offBroadcast || a.gapBroadcast) {
        rows.push([cell.iso, dowName, '방송실', a.broadcast || '',
          ceLogNote(a.offBroadcast, a.gapBroadcast, a.swapNote, a.warning, a.substitute), stamp]);
      }
      if (special.label && (special.name || special.off || special.gap)) {
        rows.push([cell.iso, dowName, special.label, special.name || '',
          ceLogNote(special.off, special.gap, special.swapNote, special.warning, a.specialSubstitute), stamp]);
      }
    }
  }
  return rows;
}

function ceLogSheet() {
  var sh = ceSheet(CE_TAB.LOG, true);
  if (sh.getLastRow() < 1) {
    sh.getRange(1, 1, 1, CE_LOG_HEADERS.length).setValues([CE_LOG_HEADERS])
      .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 100);
    sh.setColumnWidth(4, 120);
    sh.setColumnWidth(5, 320);
    sh.setColumnWidth(6, 140);
  }
  return sh;
}

function ceReadLog() {
  var sh = ceSheet(CE_TAB.LOG, false);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, CE_LOG_HEADERS.length).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) { return [ceCellToIso(r[0]) || String(r[0]), r[1], r[2], r[3], r[4], r[5]]; });
}

/**
 * 그 달의 기록만 갈아 끼우고 나머지는 그대로 둡니다.
 * 반환값은 이번에 새로 생긴 '대타' 줄들입니다.
 */
function ceAppendLog(year, month, grid, sched, cfg) {
  var prefix = ceFormatYearMonth(year, month);
  var stamp = Utilities.formatDate(new Date(), ceTz(), 'yyyy-MM-dd HH:mm');
  var fresh = ceLogRowsForMonth(year, month, grid, sched, cfg, stamp);

  var kept = ceReadLog().filter(function (r) { return String(r[0]).indexOf(prefix) !== 0; });
  var all = kept.concat(fresh);
  all.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    return String(a[2]) < String(b[2]) ? -1 : 1;
  });

  var sh = ceLogSheet();
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, CE_LOG_HEADERS.length).clearContent();
  }
  if (all.length) sh.getRange(2, 1, all.length, CE_LOG_HEADERS.length).setValues(all);
  sh.hideSheet();

  return fresh.filter(function (r) { return String(r[4]).indexOf('대타') === 0; });
}

/** 기록 탭을 펼쳐 보여 줍니다. */
function ceShowLog() {
  var sh = ceSheet(CE_TAB.LOG, false);
  if (!sh) return null;
  sh.showSheet();
  ceSS().setActiveSheet(sh);
  return sh;
}
