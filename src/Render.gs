/**
 * 월별 배정 표를 그립니다. (원래 쓰시던 표와 같은 모양)
 *
 *   A열 = 항목 이름,  B~G열 = 월~토
 *   한 주마다 Date / 설교자 / 방송실 / 수요저녁 현관 네 줄
 */

var CE_OUT = {
  TITLE_ROW: 1,
  DOW_ROW: 2,
  FIRST_BLOCK_ROW: 3,
  COLS: 6,          // 월~토
  FIRST_COL: 2,     // B열
  WED_OFFSET: 2     // 월~토 중 수요일 위치 -> D열
};

var CE_ROW_LABELS = ['Date', '설교자', '방송실', '수요저녁 현관'];

function ceMonthSheetName(year, month) {
  return ceFormatYearMonth(year, month);
}

/**
 * 배정을 계산해서 'YYYY-MM' 시트에 씁니다. 시트가 있으면 덮어씁니다.
 * 저장된 순번 없이 기준일부터 매번 새로 계산하므로, 몇 번을 돌려도 결과가 같습니다.
 */
function ceGenerateMonth(year, month) {
  ceSaveCalendar();               // 달력에 적어만 두고 저장 안 한 내용까지 반영

  var cfg = ceReadConfig();
  var rot = ceReadRotations();
  if (!rot.sermon.length) throw new Error('"' + CE_TAB.ROTATION + '" 탭의 [설교] 명단이 비어 있습니다.');

  var ex = ceReadAllExceptions();
  var grid = ceMonthGrid(year, month);

  if (grid.endIso < cfg.anchor) {
    throw new Error('로테이션 시작일(' + cfg.anchor + ') 보다 앞선 달입니다. 시작일을 앞으로 당겨 주세요.');
  }

  var sched = ceBuildSchedule(cfg, rot, ex, grid.endIso);
  ceWriteMonthSheet(year, month, grid, sched, cfg, rot);
  return { sheetName: ceMonthSheetName(year, month), warnings: ceCollectWarnings(grid, sched) };
}

function ceCollectWarnings(grid, sched) {
  var out = [];
  for (var w = 0; w < grid.weeks.length; w++) {
    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = grid.weeks[w][c];
      var a = sched.byIso[cell.iso];
      if (!a) continue;
      if (a.warning) out.push(cell.iso + ' : ' + a.warning);
      if (!a.preacher && !a.offSermon && cell.iso >= grid.startIso) {
        out.push(cell.iso + ' : 설교자를 채우지 못했습니다 (전원 예외)');
      }
    }
  }
  return out;
}

/** 휴일 칸: 비운 채로 표시만 해 둡니다. 그대로 손으로 적으시면 됩니다. */
function ceMarkHoliday(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.HOLIDAY_BG).setNote('휴일 — 직접 입력하세요');
}

function ceWriteMonthSheet(year, month, grid, sched, cfg, rot) {
  var sh = ceSheet(ceMonthSheetName(year, month), true);
  sh.clear();
  sh.clearNotes();
  // 지난번에 그린 병합을 먼저 풉니다. 주 수가 5주/6주로 달라지면
  // 예전 병합이 엉뚱한 자리에 남습니다.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();

  var totalCols = CE_OUT.FIRST_COL + CE_OUT.COLS - 1;   // G열

  // 제목
  sh.getRange(CE_OUT.TITLE_ROW, 1, 1, totalCols).merge()
    .setValue(year + '년 ' + month + '월 새벽 설교자 및 백업')
    .setBackground(CE_COLOR.TITLE_BG).setFontColor('#ffffff')
    .setFontSize(12).setFontWeight('bold').setHorizontalAlignment('center');

  // 요일 머리줄
  sh.getRange(CE_OUT.DOW_ROW, CE_OUT.FIRST_COL, 1, CE_OUT.COLS)
    .setValues([['월', '화', '수', '목', '금', '토']])
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');

  for (var w = 0; w < grid.weeks.length; w++) {
    var base = CE_OUT.FIRST_BLOCK_ROW + w * 4;
    var week = grid.weeks[w];

    var dates = [];
    var preachers = [];
    var broadcasts = [];
    var doors = [];

    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = week[c];
      var a = sched.byIso[cell.iso] || {
        preacher: '', broadcast: '', door: '',
        offSermon: false, offBroadcast: false, offDoor: false,
        swapNote: '', warning: ''
      };
      dates.push(cell.day);
      preachers.push(a.preacher || '');
      broadcasts.push(a.broadcast || '');
      doors.push(c === CE_OUT.WED_OFFSET ? (a.door || '') : '');
    }

    sh.getRange(base, 1, 4, 1).setValues([[CE_ROW_LABELS[0]], [CE_ROW_LABELS[1]], [CE_ROW_LABELS[2]], [CE_ROW_LABELS[3]]])
      .setFontWeight('bold').setFontSize(9).setWrap(true);

    sh.getRange(base, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([dates]);
    sh.getRange(base + 1, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([preachers]);
    sh.getRange(base + 2, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([broadcasts]);
    sh.getRange(base + 3, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([doors]);

    sh.getRange(base, 1, 1, totalCols)
      .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold');
    sh.getRange(base + 1, 1, 1, totalCols).setBackground(CE_COLOR.BAND_BG);
    sh.getRange(base, CE_OUT.FIRST_COL, 4, CE_OUT.COLS).setHorizontalAlignment('center');

    // 이번 달이 아닌 칸은 흐리게 (앞뒤 달 시트와 이름은 서로 같습니다)
    for (var k = 0; k < CE_OUT.COLS; k++) {
      var cellInfo = week[k];
      var col = CE_OUT.FIRST_COL + k;
      if (!cellInfo.inMonth) {
        sh.getRange(base, col, 4, 1).setFontColor(CE_COLOR.OUT_OF_MONTH);
      }
      var info = sched.byIso[cellInfo.iso];
      if (!info) continue;

      // 휴일로 잡은 칸은 비운 채로 노랗게 두어 손으로 적으실 수 있게 합니다.
      if (info.offSermon) ceMarkHoliday(sh, base + 1, col);
      if (info.offBroadcast) ceMarkHoliday(sh, base + 2, col);
      if (info.offDoor && k === CE_OUT.WED_OFFSET) ceMarkHoliday(sh, base + 3, col);
      if (info.offSermon && info.offBroadcast) {
        sh.getRange(base, col).setNote('휴일');
      }

      if (info.swapNote) {
        sh.getRange(base + 2, col).setNote('설교자와 겹쳐서 ' + info.swapNote);
      }
      if (info.warning) {
        sh.getRange(base + 2, col).setBackground(CE_COLOR.WARN_BG).setNote(info.warning);
      }
      if (!info.preacher && !info.offSermon) {
        sh.getRange(base + 1, col).setBackground(CE_COLOR.WARN_BG).setNote('배정할 사람이 없습니다 (전원 예외)');
      }
    }
  }

  var lastRow = CE_OUT.FIRST_BLOCK_ROW + grid.weeks.length * 4 - 1;
  sh.getRange(CE_OUT.DOW_ROW, 1, lastRow - CE_OUT.DOW_ROW + 1, totalCols)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  var footRow = lastRow + 2;
  sh.getRange(footRow, 1, 1, totalCols).merge()
    .setValue('자동 생성 · 기준일 ' + cfg.anchor +
      ' · 설교 ' + rot.sermon.length + '명 / 방송 ' + rot.broadcast.length + '명 / 수요현관 ' + rot.door.length + '명' +
      ' · ' + Utilities.formatDate(new Date(), ceTz(), 'yyyy-MM-dd HH:mm'))
    .setFontSize(9).setFontColor('#666666');

  sh.setColumnWidth(1, 90);
  for (var col2 = CE_OUT.FIRST_COL; col2 <= totalCols; col2++) sh.setColumnWidth(col2, 100);
  // 열 고정은 쓰지 않습니다. 제목 줄과 맨 아래 설명 줄이 A~G로 병합되어 있어서
  // 1열만 고정하면 병합된 칸이 갈라져 구글 시트가 막습니다. 표가 7열뿐이라
  // 가로로 밀 일도 없으므로, 대신 위쪽 두 줄을 고정합니다.
  sh.setFrozenRows(CE_OUT.DOW_ROW);
  return sh;
}
