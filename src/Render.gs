/**
 * 월별 배정 표를 그립니다. (원래 쓰시던 표와 같은 모양)
 *
 *   A열 = 항목 이름,  B~G열 = 월~토
 *   한 주마다 Date / 설교자 / 방송실 / 수요·토요 네 줄
 */

var CE_OUT = {
  TITLE_ROW: 1,
  DOW_ROW: 2,
  FIRST_BLOCK_ROW: 3,
  COLS: 6,          // 월~토
  FIRST_COL: 2      // B열
};

var CE_ROW_LABELS = ['Date', '설교자', '방송실', '수요/토요'];

/**
 * 넷째 줄은 요일에 따라 내용이 바뀝니다.
 * 수요일에는 수요현관 담당, 토요일에는 토요찬양 담당이 들어갑니다.
 * 이 줄은 그날 설교자·방송실과 겹쳐도 손대지 않고 명단 순서대로 갑니다.
 */
function ceSpecialSlot(dow, info, cfg) {
  var doorDows = cfg.doorDows && cfg.doorDows.length ? cfg.doorDows : [3];
  var praiseDows = cfg.praiseDows && cfg.praiseDows.length ? cfg.praiseDows : [6];
  if (doorDows.indexOf(dow) >= 0) {
    return { name: info.door || '', off: !!info.offDoor, gap: !!info.gapDoor, label: '수요현관' };
  }
  if (praiseDows.indexOf(dow) >= 0) {
    return { name: info.praise || '', off: !!info.offPraise, gap: !!info.gapPraise, label: '토요찬양' };
  }
  return { name: '', off: false, gap: false, label: '' };
}

function ceMonthSheetName(year, month) {
  return ceFormatYearMonth(year, month);
}

/**
 * 배정을 계산해서 'YYYY-MM' 시트에 씁니다. 시트가 있으면 덮어씁니다.
 * 저장된 순번 없이 기준일부터 매번 새로 계산하므로, 몇 번을 돌려도 결과가 같습니다.
 */
function ceGenerateMonth(year, month) {
  ceRenameLegacyTabs();           // 예전 이름의 탭이 있으면 먼저 바꿔 둡니다
  ceSaveCalendar();               // 달력에 적어만 두고 아직 안 넘긴 내용까지 반영

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

  var sheetName = ceMonthSheetName(year, month);
  ceOrderTabs(sheetName);

  return {
    sheetName: sheetName,
    warnings: ceCollectWarnings(grid, sched, cfg),
    notes: ceFallbackNotes(rot, cfg).concat(ceUnknownNameNotes(rot, ex, grid))
  };
}

/**
 * 명단이 왜 안 쓰이고 있는지 알려 줍니다.
 * 열 자체를 못 찾은 것과, 열은 있는데 이름이 안 적힌 것을 구분합니다.
 */
function ceFallbackNotes(rot, cfg) {
  var cols = rot._columns || {};
  var notes = [];


  // 토요일이 새벽예배 요일에 없으면 토요일 칸은 아예 비어 있게 됩니다.
  var satMissing = [];
  for (var d = 0; d < cfg.satDows.length; d++) {
    if (cfg.dawnDows.indexOf(cfg.satDows[d]) < 0) satMissing.push(CE_DOW_NAMES[cfg.satDows[d]]);
  }
  if (satMissing.length) {
    notes.push('[설정] 탭의 [새벽예배 요일] 에 ' + satMissing.join('·') + '요일이 없습니다. ' +
      '그래서 그 요일은 설교자·방송실을 아예 배정하지 않습니다.');
  }
  var praiseMissing = [];
  for (var q = 0; q < cfg.praiseDows.length; q++) {
    if (cfg.dawnDows.indexOf(cfg.praiseDows[q]) < 0) praiseMissing.push(CE_DOW_NAMES[cfg.praiseDows[q]]);
  }
  void praiseMissing;   // 토요찬양은 새벽예배와 무관하므로 알리지 않습니다.

  function check(key, header, whenEmpty) {
    if (!cols[key]) {
      notes.push('[' + header + '] 열을 "' + CE_TAB.ROTATION + '" 탭에서 찾지 못했습니다. ' +
        '[초기 설정 만들기] 를 한 번 더 눌러 주세요.');
      return;
    }
    if (!(rot[key] || []).length) {
      notes.push('[' + header + '] 열(' + ceColumnLetter(cols[key]) + '열)에 이름이 없습니다. ' + whenEmpty);
    }
  }

  check('satSermon', '토요설교', '토요일도 [설교] 명단으로 이어서 돌았습니다.');
  check('satBroadcast', '토요방송', '토요일도 [방송] 명단으로 이어서 돌았습니다.');
  check('door', '수요현관', '수요일 넷째 줄은 비워 두었습니다.');
  check('praise', '토요찬양', '토요일 넷째 줄은 비워 두었습니다.');
  return notes;
}

/**
 * 달력에 적힌 이름이 명단에 없으면 알려 줍니다.
 * '김목사' 를 '김목사님' 이라고 적으면 프로그램은 다른 사람으로 보고 그냥 넘어가므로,
 * 그 사람은 빠지지 않고 그대로 표에 들어갑니다. 오타는 이렇게만 잡힙니다.
 */
function ceUnknownNameNotes(rot, exceptions, grid) {
  var known = {};
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) {
    var list = rot[CE_ROTATION_COLUMNS[i].key] || [];
    for (var n = 0; n < list.length; n++) known[list[n]] = true;
  }

  var seen = {};
  var unknown = [];
  for (var e = 0; e < exceptions.length; e++) {
    var ex = exceptions[e];
    if (ex.start < grid.startIso || ex.start > grid.endIso) continue;   // 이번 달 것만 봅니다
    if (ceIsHolidayName(ex.name)) continue;                             // '휴일' 은 사람이 아닙니다
    if (known[ex.name] || seen[ex.name]) continue;
    seen[ex.name] = true;
    unknown.push(ex.name + ' (' + ex.start + ')');
  }

  if (!unknown.length) return [];
  return ['[' + CE_TAB.CALENDAR + '] 에 적힌 ' + unknown.join(', ') + ' 은(는) 명단에 없는 이름입니다. ' +
    '이름이 다르면 그 사람은 빠지지 않고 그대로 배정됩니다. 오타가 아닌지 확인해 주세요.'];
}

function ceCollectWarnings(grid, sched, cfg) {
  var out = [];
  var labels = [
    { gap: 'gapSermon', label: '설교자' },
    { gap: 'gapBroadcast', label: '방송실' },
    { gap: 'gapDoor', label: '수요현관' },
    { gap: 'gapPraise', label: '토요찬양' }
  ];
  for (var w = 0; w < grid.weeks.length; w++) {
    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = grid.weeks[w][c];
      var a = sched.byIso[cell.iso];
      if (!a || cell.iso < grid.startIso) continue;
      if (a.warning) out.push(cell.iso + ' : ' + a.warning);
      for (var i = 0; i < labels.length; i++) {
        if (a[labels[i].gap]) {
          out.push(cell.iso + ' : ' + labels[i].label + ' 를 채우지 못했습니다 (전원 예외)');
        }
      }
    }
  }
  return out;
}

/** 휴일 칸: 비운 채로 표시만 해 둡니다. 그대로 손으로 적으시면 됩니다. */
function ceMarkHoliday(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.HOLIDAY_BG).setNote('휴일 — 직접 입력하세요');
}

/** 명단은 있는데 그날 전원이 예외라 못 채운 칸. */
function ceMarkGap(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.WARN_BG).setNote('배정할 사람이 없습니다 (전원 예외)');
}

/** '설교 4명 / 방송 3명 / ...' 처럼 채워진 명단만 적습니다. */
function ceRotationSummary(rot) {
  var parts = [];
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) {
    var def = CE_ROTATION_COLUMNS[i];
    var list = rot[def.key] || [];
    if (list.length) parts.push(def.header + ' ' + list.length + '명');
  }
  return parts.length ? parts.join(' / ') : '명단 없음';
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
    var specials = [];

    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = week[c];
      var a = sched.byIso[cell.iso] || {
        preacher: '', broadcast: '', door: '', praise: '',
        offSermon: false, offBroadcast: false, offDoor: false, offPraise: false,
        gapSermon: false, gapBroadcast: false, gapDoor: false, gapPraise: false,
        swapNote: '', warning: ''
      };
      dates.push(cell.day);
      preachers.push(a.preacher || '');
      broadcasts.push(a.broadcast || '');
      specials.push(ceSpecialSlot(cell.dow, a, cfg).name);
    }

    sh.getRange(base, 1, 4, 1).setValues([[CE_ROW_LABELS[0]], [CE_ROW_LABELS[1]], [CE_ROW_LABELS[2]], [CE_ROW_LABELS[3]]])
      .setFontWeight('bold').setFontSize(9).setWrap(true);

    sh.getRange(base, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([dates]);
    sh.getRange(base + 1, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([preachers]);
    sh.getRange(base + 2, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([broadcasts]);
    sh.getRange(base + 3, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([specials]);

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

      var special = ceSpecialSlot(cellInfo.dow, info, cfg);

      // 휴일로 잡은 칸은 비운 채로 노랗게 두어 손으로 적으실 수 있게 합니다.
      if (info.offSermon) ceMarkHoliday(sh, base + 1, col);
      if (info.offBroadcast) ceMarkHoliday(sh, base + 2, col);
      if (special.off) ceMarkHoliday(sh, base + 3, col);
      if (info.offSermon && info.offBroadcast) {
        sh.getRange(base, col).setNote('휴일');
      }

      if (info.swapNote) {
        sh.getRange(base + 2, col).setNote('설교자와 겹쳐서 ' + info.swapNote);
      }
      if (info.warning) {
        sh.getRange(base + 2, col).setBackground(CE_COLOR.WARN_BG).setNote(info.warning);
      }
      if (info.gapSermon) ceMarkGap(sh, base + 1, col);
      if (info.gapBroadcast) ceMarkGap(sh, base + 2, col);
      if (special.gap) ceMarkGap(sh, base + 3, col);
    }
  }

  var lastRow = CE_OUT.FIRST_BLOCK_ROW + grid.weeks.length * 4 - 1;
  sh.getRange(CE_OUT.DOW_ROW, 1, lastRow - CE_OUT.DOW_ROW + 1, totalCols)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  var footRow = lastRow + 2;
  sh.getRange(footRow, 1, 1, totalCols).merge()
    .setValue('자동 생성 · 기준일 ' + cfg.anchor + ' · ' + ceRotationSummary(rot) +
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
