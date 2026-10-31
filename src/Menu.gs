/**
 * 시트 상단 메뉴.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('새벽예배 배정')
    .addItem('새벽설교 배정표 만들기', 'ceMenuGenerate')
    .addSeparator()
    .addItem('초기 설정 만들기', 'ceMenuSetup')
    .addToUi();

  // 달력 연월 칸의 목록은 시트를 열 때마다 다시 걸어 둡니다.
  // (달력을 다시 그리지 않아도 목록이 뜨도록)
  try {
    ceEnsureCalendarDropdown();
  } catch (err) {
    // 목록을 못 걸어도 메뉴는 떠야 하므로 넘어갑니다.
  }
}

/**
 * 칸을 고칠 때마다 불립니다. 두 가지를 봅니다.
 *  - 달력 탭의 연월 칸(B1)  -> 그 달 달력을 다시 그립니다
 *  - 월별 표의 이름 체크박스 -> 한 사람만 체크되게 다른 체크를 풉니다
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() === CE_TAB.CALENDAR) {
    ceOnCalendarMonthPick(e);
    return;
  }
  ceOnNamePick(e, sh);
}

/** 달력 탭의 연월 칸을 고치면 그 달로 다시 그립니다. */
function ceOnCalendarMonthPick(e) {
  if (e.range.getRow() !== CE_CAL.YM_ROW || e.range.getColumn() !== CE_CAL.YM_COL) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ym = ceParseYearMonth(e.range.getValue());
  if (!ym) {
    ss.toast('연월을 알아볼 수 없습니다. 2026-09 형식으로 골라 주세요.', '달력', 5);
    return;
  }
  try {
    ceRenderCalendar(ym.year, ym.month);
    ss.toast(ceFormatYearMonth(ym.year, ym.month) + ' 달력을 불러왔습니다.', '달력', 5);
  } catch (err) {
    ss.toast('달력을 그리지 못했습니다: ' + err.message, '달력', 8);
  }
}

/**
 * 이름 체크는 한 사람씩만 되게 합니다.
 * 새로 체크하면 그 표에 켜져 있던 다른 체크를 모두 풉니다.
 *
 * 체크박스 칸만 값이 참·거짓(boolean)이고 표의 다른 칸은 글자나 숫자이므로,
 * 켜진 체크박스는 '값이 true 인 칸' 으로 찾습니다.
 * 스크립트가 고친 칸은 onEdit 을 다시 부르지 않으므로 서로 물리지 않습니다.
 */
function ceOnNamePick(e, sh) {
  if (!ceIsMonthSheetName(sh.getName())) return;
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  if (e.range.getValue() !== true) return;     // 체크를 풀 때는 할 일이 없습니다

  var row = e.range.getRow();
  var col = e.range.getColumn();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return;

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      if (r === row - 1 && c === col - 1) continue;
      if (values[r][c] === true) sh.getRange(r + 1, c + 1).setValue(false);
    }
  }
}

function ceMenuSetup() {
  var ui = SpreadsheetApp.getUi();
  try {
    var res = ceSetupAll();
    var msg = [];
    if (res.renamed.length) msg.push('이름을 바꾼 탭: ' + res.renamed.join(', '));
    if (res.created.length) msg.push('만든 탭: ' + res.created.join(', '));
    if (res.updated.length) {
      msg.push('보완한 내용');
      for (var u = 0; u < res.updated.length; u++) msg.push('  · ' + res.updated[u]);
    }
    if (!msg.length) msg.push('필요한 탭이 이미 모두 있고, 설명도 최신입니다.');
    var stale = [];
    if (ceSS().getSheetByName('장기예외')) stale.push('장기예외');
    if (ceSS().getSheetByName('_기록')) stale.push('_기록');
    if (stale.length) {
      msg.push('');
      msg.push('※ 이제 쓰지 않는 탭이 남아 있습니다: ' + stale.join(', '));
      msg.push('   지우셔도 배정에는 아무 영향이 없습니다.');
    }

    msg.push('');
    msg.push('[로테이션] 탭에 이름을 넣고, [설정] 탭의 로테이션 시작일을 확인한 뒤');
    msg.push('[새벽설교 배정표 만들기] 를 눌러 주세요.');
    ui.alert(msg.join('\n'));
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

function ceMenuGenerate() {
  var ui = SpreadsheetApp.getUi();
  var now = new Date();
  var suggested = ceFormatYearMonth(now.getFullYear(), now.getMonth() + 1);

  // 달력이 보고 있는 달을 먼저 권합니다.
  var shown = ceStoreGetShownMonth() || ceCalendarYearMonth();
  if (shown) suggested = ceFormatYearMonth(shown.year, shown.month);

  var res = ui.prompt('새벽설교 배정표 만들기',
    '어느 달을 배정할까요?\n\n비워 두고 [확인] 을 누르면 ' + suggested + ' 로 배정합니다.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var typed = String(res.getResponseText() || '').trim();
  var ym = typed ? ceParseYearMonth(typed) : ceParseYearMonth(suggested);
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
