/**
 * 시트 상단 메뉴.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('새벽예배 배정')
    .addItem('① 초기 설정 만들기', 'ceMenuSetup')
    .addSeparator()
    .addItem('② 달력 다시 그리기 (달 바꾸기)', 'ceMenuRenderCalendar')
    .addItem('③ 이번 달 배정하기', 'ceMenuGenerateThisMonth')
    .addItem('④ 다른 달 배정하기…', 'ceMenuGeneratePickMonth')
    .addSeparator()
    .addItem('명단·예외 점검', 'ceMenuCheck')
    .addToUi();
}

function ceMenuSetup() {
  var ui = SpreadsheetApp.getUi();
  try {
    var res = ceSetupAll();
    var msg = [];
    if (res.created.length) msg.push('만든 탭: ' + res.created.join(', '));
    if (res.updated.length) msg.push('보완한 탭: ' + res.updated.join(', '));
    if (!msg.length) msg.push('필요한 탭이 이미 모두 있습니다.');
    msg.push('');
    msg.push('[로테이션] 탭에 이름을 넣고, [설정] 탭의 로테이션 시작일을 확인한 뒤');
    msg.push('[③ 이번 달 배정하기] 를 눌러 주세요.');
    ui.alert(msg.join('\n'));
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

function ceMenuRenderCalendar() {
  var ui = SpreadsheetApp.getUi();
  try {
    var sh = ceSheet(CE_TAB.CALENDAR, false);
    var current = sh ? ceParseYearMonth(sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL).getValue()) : null;
    if (!current) {
      var now = new Date();
      current = { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
    var res = ui.prompt('달력 다시 그리기',
      '어느 달을 보시겠습니까?  (예: ' + ceFormatYearMonth(current.year, current.month) + ')',
      ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    var ym = ceParseYearMonth(res.getResponseText());
    if (!ym) { ui.alert('YYYY-MM 형식으로 적어 주세요. 예) 2026-09'); return; }

    var out = ceRenderCalendar(ym.year, ym.month);
    ceSS().setActiveSheet(out);
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

function ceMenuGenerateThisMonth() {
  var now = new Date();
  ceRunGenerate(now.getFullYear(), now.getMonth() + 1);
}

function ceMenuGeneratePickMonth() {
  var ui = SpreadsheetApp.getUi();
  var now = new Date();
  var res = ui.prompt('다른 달 배정하기',
    '어느 달을 배정할까요?  (예: ' + ceFormatYearMonth(now.getFullYear(), now.getMonth() + 1) + ')',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var ym = ceParseYearMonth(res.getResponseText());
  if (!ym) { ui.alert('YYYY-MM 형식으로 적어 주세요. 예) 2026-09'); return; }
  ceRunGenerate(ym.year, ym.month);
}

function ceRunGenerate(year, month) {
  var ui = SpreadsheetApp.getUi();
  try {
    var out = ceGenerateMonth(year, month);
    var sh = ceSheet(out.sheetName, false);
    if (sh) ceSS().setActiveSheet(sh);

    var msg = ['[' + out.sheetName + '] 배정을 마쳤습니다.'];
    if (out.notes.length) {
      msg.push('');
      msg.push(out.notes.join('\n'));
    }
    if (out.warnings.length) {
      msg.push('');
      msg.push('확인이 필요한 날:');
      msg.push(out.warnings.join('\n'));
    }
    ui.alert(msg.join('\n'));
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

function ceMenuCheck() {
  var ui = SpreadsheetApp.getUi();
  try {
    ceSaveCalendar();
    var cfg = ceReadConfig();
    var rot = ceReadRotations();
    var ex = ceReadAllExceptions();

    var lines = [];
    function dows(list) {
      return list.map(function (d) { return CE_DOW_NAMES[d]; }).join(',');
    }
    lines.push('로테이션 시작일 : ' + cfg.anchor);
    lines.push('새벽예배 요일 : ' + dows(cfg.dawnDows));
    lines.push('토요 별도 요일 : ' + dows(cfg.satDows));
    lines.push('수요현관 요일 : ' + dows(cfg.doorDows));
    lines.push('토요찬양 요일 : ' + dows(cfg.praiseDows));
    lines.push('');
    var cols = rot._columns || {};
    for (var ci = 0; ci < CE_ROTATION_COLUMNS.length; ci++) {
      var def = CE_ROTATION_COLUMNS[ci];
      var list = rot[def.key] || [];
      var where = cols[def.key] ? ceColumnLetter(cols[def.key]) + '열' : '열을 못 찾음';
      lines.push(def.header + ' [' + where + '] ' + list.length + '명 : ' + (list.join(', ') || '(비어 있음)'));
    }

    var missing = [];
    for (var mi = 0; mi < CE_ROTATION_COLUMNS.length; mi++) {
      if (!cols[CE_ROTATION_COLUMNS[mi].key]) missing.push(CE_ROTATION_COLUMNS[mi].header);
    }
    if (missing.length) {
      lines.push('');
      lines.push('※ 열을 못 찾은 명단: ' + missing.join(', '));
      lines.push('   [① 초기 설정 만들기] 를 한 번 더 누르면 열을 만들어 드립니다.');
    }
    if (!rot.satSermon.length || !rot.satBroadcast.length) {
      lines.push('');
      lines.push('※ 토요 명단이 비어 있는 쪽은 평일 명단으로 그냥 이어서 돕니다.');
    }

    lines.push('');
    lines.push('[' + CE_TAB.ROTATION + '] 탭 1행에 적힌 그대로: ' + ceRotationHeaderRow());
    lines.push('');
    var holidayCount = 0;
    ex.forEach(function (e) { if (ceIsHolidayName(e.name)) holidayCount++; });
    lines.push('등록된 예외 ' + (ex.length - holidayCount) + '건, 휴일 ' + holidayCount + '건');

    var leftover = ceSS().getSheetByName('장기예외');
    if (leftover) {
      lines.push('');
      lines.push('※ [장기예외] 탭은 이제 쓰지 않습니다. 거기 적으신 내용은 배정에 반영되지 않으니');
      lines.push('   [달력] 탭으로 옮기신 뒤 탭을 지워 주세요.');
    }

    var unknown = ceUnknownNames(rot, ex);
    if (unknown.length) {
      lines.push('');
      lines.push('※ 명단에 없는 이름이 예외에 들어 있습니다: ' + unknown.join(', '));
    }
    ui.alert('점검 결과', lines.join('\n'), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

/** 로테이션 탭 1행을 있는 그대로 보여 줍니다. 머리글 오타를 찾을 때 씁니다. */
function ceRotationHeaderRow() {
  var sh = ceSheet(CE_TAB.ROTATION, false);
  if (!sh) return '(탭 없음)';
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var parts = [];
  for (var c = 0; c < headers.length; c++) {
    var text = String(headers[c] == null ? '' : headers[c]).trim();
    if (text.length > 12) text = text.slice(0, 12) + '…';
    parts.push(ceColumnLetter(c + 1) + '=' + (text || '(빈칸)'));
  }
  return parts.join('  ');
}

function ceUnknownNames(rot, exceptions) {
  var known = {};
  CE_ROTATION_COLUMNS.forEach(function (def) {
    (rot[def.key] || []).forEach(function (n) { known[n] = true; });
  });
  var seen = {};
  var out = [];
  exceptions.forEach(function (e) {
    if (ceIsHolidayName(e.name)) return;          // '휴일' 은 사람 이름이 아닙니다
    if (!known[e.name] && !seen[e.name]) { seen[e.name] = true; out.push(e.name); }
  });
  return out;
}
