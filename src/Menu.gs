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
    var created = ceSetupAll();
    ui.alert(created.length
      ? '다음 탭을 만들었습니다:\n\n' + created.join(', ') +
        '\n\n[로테이션] 탭에 이름을 넣고, [설정] 탭의 로테이션 시작일을 확인한 뒤\n[③ 이번 달 배정하기] 를 눌러 주세요.'
      : '필요한 탭이 이미 모두 있습니다.');
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
    ui.alert(out.warnings.length
      ? '[' + out.sheetName + '] 배정을 마쳤습니다.\n\n다만 아래는 확인이 필요합니다:\n\n' + out.warnings.join('\n')
      : '[' + out.sheetName + '] 배정을 마쳤습니다.');
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
    lines.push('로테이션 시작일 : ' + cfg.anchor);
    lines.push('새벽예배 요일 : ' + cfg.dawnDows.map(function (d) { return CE_DOW_NAMES[d]; }).join(','));
    lines.push('수요저녁 요일 : ' + cfg.doorDows.map(function (d) { return CE_DOW_NAMES[d]; }).join(','));
    lines.push('');
    lines.push('설교 ' + rot.sermon.length + '명 : ' + (rot.sermon.join(', ') || '(비어 있음)'));
    lines.push('방송 ' + rot.broadcast.length + '명 : ' + (rot.broadcast.join(', ') || '(비어 있음)'));
    lines.push('수요현관 ' + rot.door.length + '명 : ' + (rot.door.join(', ') || '(비어 있음)'));
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

function ceUnknownNames(rot, exceptions) {
  var known = {};
  ['sermon', 'broadcast', 'door'].forEach(function (k) {
    rot[k].forEach(function (n) { known[n] = true; });
  });
  var seen = {};
  var out = [];
  exceptions.forEach(function (e) {
    if (ceIsHolidayName(e.name)) return;          // '휴일' 은 사람 이름이 아닙니다
    if (!known[e.name] && !seen[e.name]) { seen[e.name] = true; out.push(e.name); }
  });
  return out;
}
