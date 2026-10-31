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
  FIRST_COL: 2,     // B열
  USHER_COL: 9      // I열 - 현관안내(수,토). H열은 표와 떼어 놓는 빈 열입니다.
};

var CE_USHER_HEADER = '현관안내(수,토)';
var CE_USHER_GAP_NOTE = '현관안내를 세 명 다 채우지 못했습니다. ' +
  '그 주 수요백업·토요백업으로 선 사람과 그 주 예외자는 세우지 않습니다.';

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
  ceRemoveQtTab();                // 예전 '생명의 삶' 탭이 남아 있으면 지웁니다
  try {
    ceRemoveQtTrigger();          // 이제 쓰지 않는 편집 트리거를 걷어냅니다
  } catch (err) {
    // 못 지워도 배정은 그대로 됩니다.
  }
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
    notes: ceFallbackNotes(rot, cfg)
      .concat(ceHolidayListNotes(rot, sched, grid))
      .concat(ceMondayHintNotes(sched, grid))
      .concat(ceUnknownNameNotes(rot, ex, grid))
      .concat(ceSwapSummaryNotes(sched, grid))
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
  check('door', '수요백업', '수요일 넷째 줄은 비워 두었습니다.');
  check('praise', '토요백업', '토요일 넷째 줄은 비워 두었습니다.');
  check('usher', '현관안내', '현관안내 칸은 비워 두었습니다.');
  return notes;
}

/** 그 달에 휴일이 있는데 휴일 명단이 비어 있으면 알려 줍니다. */
function ceHolidayListNotes(rot, sched, grid) {
  var hasHoliday = false;
  for (var iso in sched.byIso) {
    if (!Object.prototype.hasOwnProperty.call(sched.byIso, iso)) continue;
    if (iso < grid.startIso || iso > grid.endIso) continue;
    var a = sched.byIso[iso];
    if (a.offSermon || a.offBroadcast) { hasHoliday = true; break; }
  }
  if (!hasHoliday) return [];

  var notes = [];
  if (!(rot.holidaySermon || []).length) {
    notes.push('[휴일(설교)] 명단이 비어 있어 휴일 설교자 칸을 비워 두었습니다.');
  }
  if (!(rot.holidayBroadcast || []).length) {
    notes.push('[휴일(백업)] 명단이 비어 있어 휴일 방송실 칸을 비워 두었습니다.');
  }
  return notes;
}

/** 'M/D' 로 짧게. 안내 문구에서 날짜를 여럿 늘어놓을 때 씁니다. */
function ceShortDay(iso) {
  return Number(iso.slice(5, 7)) + '/' + Number(iso.slice(8, 10));
}

/**
 * 순서를 바꾼 자리가 어디인지 배정 직후에 알려 줍니다.
 * 바뀐 칸에는 메모가 붙지만 검은 삼각형이 작아 못 보고 지나치기 쉽습니다.
 */
function ceSwapSummaryNotes(sched, grid) {
  var swapped = [];
  var moved = [];
  for (var i = 0; i < sched.dawnDays.length; i++) {
    var d = sched.dawnDays[i];
    if (d.iso < grid.startIso || d.iso > grid.endIso) continue;

    // 맞바꾼 두 날 모두 메모가 붙으므로, 겹쳤던 쪽(앞선 날)만 셉니다.
    if (d.swapNote && d.swapNote.split(' ')[0] > d.iso) {
      swapped.push(ceShortDay(d.iso));
    }
    // 월요일 중복은 월요일 쪽만 셉니다 (상대는 월요일이 아닙니다).
    if (d.dow === 1 && (d.mondayNoteSermon || d.mondayNoteBroadcast)) {
      var what = [];
      if (d.mondayNoteSermon) what.push('설교');
      if (d.mondayNoteBroadcast) what.push('방송실');
      moved.push(ceShortDay(d.iso) + '(' + what.join('·') + ')');
    }
  }

  var notes = [];
  if (swapped.length) {
    notes.push('설교자와 겹쳐서 방송실을 맞바꾼 날: ' + swapped.join(', '));
  }
  if (moved.length) {
    notes.push('월요일에 두 번 걸려 순서를 바꾼 날: ' + moved.join(', '));
  }
  if (notes.length) {
    notes.push('바뀐 칸에 메모가 붙어 있습니다. 칸 오른쪽 위 검은 삼각형에 마우스를 올리면 보입니다.');
  }
  return notes;
}

/** 월요일 중복을 못 푼 경우, 왜 그런지 한 번만 덧붙입니다. */
function ceMondayHintNotes(sched, grid) {
  for (var iso in sched.byIso) {
    if (!Object.prototype.hasOwnProperty.call(sched.byIso, iso)) continue;
    if (iso < grid.startIso || iso > grid.endIso) continue;
    if (sched.byIso[iso].mondayWarning) {
      return ['월요일 중복이 남았습니다. 그 달 월요일 수보다 명단 인원이 적거나, ' +
        '평일이 주 5일이라 인원이 5의 배수면 월요일마다 같은 사람이 걸립니다. ' +
        '그 명단 인원을 늘리면 풀립니다.'];
    }
  }
  return [];
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
      if (a.mondayWarning) out.push(cell.iso + ' : ' + a.mondayWarning);
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
/**
 * 한 칸에 붙일 메모를 모아 한 번에 씁니다.
 * 한 칸에 사연이 둘 이상일 수 있어서(설교자 겹침 교대 + 월요일 중복 교대),
 * 따로따로 쓰면 뒤에 쓴 것이 앞의 것을 덮어 버립니다.
 */
function ceWriteNote(sh, row, col, lines) {
  var kept = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i]) kept.push(lines[i]);
  }
  if (kept.length) sh.getRange(row, col).setNote(kept.join('\n'));
}

function ceMarkHoliday(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.HOLIDAY_BG).setNote('휴일 — 직접 입력하세요');
}

/** 명단은 있는데 그날 전원이 예외라 못 채운 칸. */
function ceMarkGap(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.WARN_BG).setNote('배정할 사람이 없습니다 (전원 예외)');
}

/**
 * 한 주 블록의 현관안내 칸(I열)을 채웁니다.
 *   맨 윗칸 - 그 주 수요일·토요일 날짜, 예) (7,10)
 *   아래 세 칸 - 현관안내 명단 순서대로 세 명
 * 칸 색은 왼쪽 표의 같은 줄과 똑같이 맞춥니다.
 */
function ceWriteUsherBlock(sh, base, week, sched, cfg) {
  var doorDows = cfg.doorDows && cfg.doorDows.length ? cfg.doorDows : [3];
  var praiseDows = cfg.praiseDows && cfg.praiseDows.length ? cfg.praiseDows : [6];

  var wed = null;
  var sat = null;
  for (var c = 0; c < CE_OUT.COLS; c++) {
    var cell = week[c];
    if (!wed && doorDows.indexOf(cell.dow) >= 0) wed = cell;
    if (!sat && praiseDows.indexOf(cell.dow) >= 0) sat = cell;
  }

  var label = '(' + (wed ? wed.day : '') + ',' + (sat ? sat.day : '') + ')';
  sh.getRange(base, CE_OUT.USHER_COL).setValue(label)
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');

  var info = (wed && sched.byIso[wed.iso]) || {};
  var names = info.ushers || [];
  for (var k = 0; k < CE_USHER_PER_WEEK; k++) {
    var cellRange = sh.getRange(base + 1 + k, CE_OUT.USHER_COL);
    cellRange.setValue(names[k] || '').setHorizontalAlignment('center');
    // 왼쪽 표의 같은 줄과 같은 바탕색
    cellRange.setBackground(k === 0 ? CE_COLOR.BAND_BG : null);
    // 못 채운 자리를 표시합니다. 채운 자리는 멀쩡하므로 빈 자리만 칠합니다.
    if (info.gapUsher && !names[k]) {
      cellRange.setBackground(CE_COLOR.WARN_BG).setNote(CE_USHER_GAP_NOTE);
    }
  }
}

/** 이 달 표에 실제로 들어간 사람 이름을 모읍니다. (가나다 순) */
function ceNamesInMonth(grid, sched, cfg) {
  var seen = {};
  var out = [];
  for (var w = 0; w < grid.weeks.length; w++) {
    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = grid.weeks[w][c];
      var a = sched.byIso[cell.iso];
      if (!a) continue;
      var names = [a.preacher, a.broadcast, ceSpecialSlot(cell.dow, a, cfg).name]
        .concat(a.ushers || []);
      for (var i = 0; i < names.length; i++) {
        var n = String(names[i] || '').trim();
        if (!n || seen[n]) continue;
        seen[n] = true;
        out.push(n);
      }
    }
  }
  out.sort();
  return out;
}

/**
 * 표 아래에 이름 목록을 깔고 그 밑에 체크박스를 붙입니다.
 * 체크하면 그 사람 칸이 보입니다. 색칠은 조건부 서식이 하므로 누르는 즉시 반응합니다.
 * 한 사람씩만 체크되게 하는 것은 onEdit(ceOnNamePick) 이 맡습니다.
 *
 * 반환값은 이 구역이 끝나는 줄 번호입니다.
 */
function ceWriteNamePicker(sh, startRow, totalCols, grid, sched, cfg) {
  sh.setConditionalFormatRules([]);

  var names = ceNamesInMonth(grid, sched, cfg);
  if (!names.length) return startRow - 1;

  sh.getRange(startRow, 1, 1, totalCols).merge()
    .setValue('이름을 체크하면 그 사람 칸이 표시됩니다 — 설교는 노랑, 방송·수요/토요·현관안내는 연한 초록.')
    .setFontSize(9).setFontColor('#666666');

  var perLine = CE_OUT.COLS;                 // 표 너비에 맞춰 한 줄에 6명씩
  var row = startRow + 1;
  var pairs = [];                            // [{nameRow, checkRow, count}]

  for (var i = 0; i < names.length; i += perLine) {
    var chunk = names.slice(i, i + perLine);
    var nameRow = row;
    var checkRow = row + 1;

    sh.getRange(nameRow, CE_OUT.FIRST_COL, 1, chunk.length).setValues([chunk])
      .setBackground('#efefef').setFontWeight('bold')
      .setHorizontalAlignment('center').setFontSize(10);
    sh.getRange(checkRow, CE_OUT.FIRST_COL, 1, chunk.length)
      .insertCheckboxes().setHorizontalAlignment('center');

    pairs.push({ nameRow: nameRow, checkRow: checkRow, count: chunk.length });
    row += 2;
  }

  var lastPickerRow = row - 1;
  sh.getRange(startRow + 1, 1, lastPickerRow - startRow, totalCols)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  ceApplyHighlightRule(sh, pairs, grid.weeks.length);
  return lastPickerRow;
}

/**
 * 체크한 이름과 같은 칸을 칠하는 조건부 서식.
 * 설교자 줄은 노랑, 방송실과 수요/토요 줄은 연한 초록으로 갈라 놓습니다.
 *
 * 규칙 하나가 여러 자리에 걸리므로, 조건식이 자리에 휘둘리지 않도록
 * INDIRECT(ADDRESS(ROW(),COLUMN())) 로 '지금 이 칸' 을 가리킵니다.
 */
function ceApplyHighlightRule(sh, pairs, weekCount) {
  var here = 'INDIRECT(ADDRESS(ROW(),COLUMN()))';

  var terms = pairs.map(function (p) {
    var from = ceColumnLetter(CE_OUT.FIRST_COL);
    var to = ceColumnLetter(CE_OUT.FIRST_COL + p.count - 1);
    return 'COUNTIFS($' + from + '$' + p.nameRow + ':$' + to + '$' + p.nameRow + ',' + here +
      ',$' + from + '$' + p.checkRow + ':$' + to + '$' + p.checkRow + ',TRUE)';
  });
  var formula = '=AND(' + here + '<>"",(' + terms.join('+') + ')>0)';

  var sermonRanges = [];
  var otherRanges = [];
  for (var w = 0; w < weekCount; w++) {
    var base = CE_OUT.FIRST_BLOCK_ROW + w * 4;
    sermonRanges.push(sh.getRange(base + 1, CE_OUT.FIRST_COL, 1, CE_OUT.COLS));
    otherRanges.push(sh.getRange(base + 2, CE_OUT.FIRST_COL, 2, CE_OUT.COLS));
    otherRanges.push(sh.getRange(base + 1, CE_OUT.USHER_COL, CE_USHER_PER_WEEK, 1));
  }
  // 체크한 이름 칸도 함께 물듭니다. 설교자와 같은 색으로 둡니다.
  for (var i = 0; i < pairs.length; i++) {
    sermonRanges.push(sh.getRange(pairs[i].nameRow, CE_OUT.FIRST_COL, 1, pairs[i].count));
  }

  sh.setConditionalFormatRules([
    ceHighlightRule(formula, CE_COLOR.PICK_SERMON_BG, sermonRanges),
    ceHighlightRule(formula, CE_COLOR.PICK_OTHER_BG, otherRanges)
  ]);
}

function ceHighlightRule(formula, background, ranges) {
  return SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground(background)
    .setRanges(ranges)
    .build();
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
  // clear() 는 내용과 서식만 지웁니다. 병합과 데이터 확인(체크박스) 규칙은 남아서,
  // 지난번 체크박스 자리에 이번에 글자가 들어가면 시트가 규칙 위반이라고 합니다.
  // 그리는 자리마다 어긋나지 않도록 둘 다 먼저 걷어냅니다.
  var whole = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  whole.breakApart();
  whole.clearDataValidations();

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

    ceWriteUsherBlock(sh, base, week, sched, cfg);
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

      // 설교자 줄 메모 (월요일 한 번 규칙)
      ceWriteNote(sh, base + 1, col, [
        info.mondayNoteSermon ? '월요일이 겹쳐서 ' + info.mondayNoteSermon : '',
        info.mondayWarnSermon
      ]);
      if (info.mondayWarnSermon) {
        sh.getRange(base + 1, col).setBackground(CE_COLOR.WARN_BG);
      }

      // 방송실 줄 메모 (설교자 겹침 교대 + 월요일 한 번 규칙)
      ceWriteNote(sh, base + 2, col, [
        info.swapNote ? '설교자와 겹쳐서 ' + info.swapNote : '',
        info.mondayNoteBroadcast ? '월요일이 겹쳐서 ' + info.mondayNoteBroadcast : '',
        info.warning,
        info.mondayWarnBroadcast
      ]);
      if (info.warning || info.mondayWarnBroadcast) {
        sh.getRange(base + 2, col).setBackground(CE_COLOR.WARN_BG);
      }
      if (info.gapSermon) ceMarkGap(sh, base + 1, col);
      if (info.gapBroadcast) ceMarkGap(sh, base + 2, col);
      if (special.gap) ceMarkGap(sh, base + 3, col);
    }
  }

  var lastRow = CE_OUT.FIRST_BLOCK_ROW + grid.weeks.length * 4 - 1;
  sh.getRange(CE_OUT.DOW_ROW, 1, lastRow - CE_OUT.DOW_ROW + 1, totalCols)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  // 현관안내 열 머리글과 테두리. 표와 같은 모양으로 맞춥니다.
  sh.getRange(CE_OUT.DOW_ROW, CE_OUT.USHER_COL).setValue(CE_USHER_HEADER)
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center').setWrap(true);
  sh.getRange(CE_OUT.DOW_ROW, CE_OUT.USHER_COL, lastRow - CE_OUT.DOW_ROW + 1, 1)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  var pickerEnd = ceWriteNamePicker(sh, lastRow + 2, totalCols, grid, sched, cfg);
  var qtRow = ceWriteQtLink(sh, pickerEnd + 2, totalCols);

  var footRow = qtRow + 2;
  sh.getRange(footRow, 1, 1, totalCols).merge()
    .setValue('자동 생성 · 기준일 ' + cfg.anchor + ' · ' + ceRotationSummary(rot) +
      ' · ' + Utilities.formatDate(new Date(), ceTz(), 'yyyy-MM-dd HH:mm'))
    .setFontSize(9).setFontColor('#666666');

  sh.setColumnWidth(1, 90);
  for (var col2 = CE_OUT.FIRST_COL; col2 <= totalCols; col2++) sh.setColumnWidth(col2, 100);
  sh.setColumnWidth(totalCols + 1, 24);                 // H열 - 표와 떼어 놓는 빈 열
  sh.setColumnWidth(CE_OUT.USHER_COL, 110);
  // 열 고정은 쓰지 않습니다. 제목 줄과 맨 아래 설명 줄이 A~G로 병합되어 있어서
  // 1열만 고정하면 병합된 칸이 갈라져 구글 시트가 막습니다. 표가 7열뿐이라
  // 가로로 밀 일도 없으므로, 대신 위쪽 두 줄을 고정합니다.
  sh.setFrozenRows(CE_OUT.DOW_ROW);
  return sh;
}
