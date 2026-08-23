/**
 * 처음 한 번 실행해서 필요한 탭을 만들어 두는 코드.
 * 이미 있는 탭은 건드리지 않습니다.
 */

function ceSetupAll() {
  var created = [];
  if (ceSetupSettings()) created.push(CE_TAB.SETTINGS);
  if (ceSetupRotation()) created.push(CE_TAB.ROTATION);
  if (ceSetupLeave()) created.push(CE_TAB.LEAVE);

  if (!ceSheet(CE_TAB.CALENDAR, false)) {
    var today = new Date();
    ceRenderCalendar(today.getFullYear(), today.getMonth() + 1);
    created.push(CE_TAB.CALENDAR);
  }
  return created;
}

/** 이번 주(또는 다음 달 1일이 속한 주)의 월요일 - 기준일 기본값으로 씁니다. */
function ceDefaultAnchor() {
  var now = new Date();
  var d = ceMakeDate(now.getFullYear(), now.getMonth() + 1, 1);
  while (d.getUTCDay() !== 1) d = ceAddDays(d, -1);
  return ceIso(d);
}

function ceSetupSettings() {
  if (ceSheet(CE_TAB.SETTINGS, false)) return false;
  var sh = ceSheet(CE_TAB.SETTINGS, true);
  var rows = [
    ['항목', '값', '설명'],
    ['로테이션 시작일', ceDefaultAnchor(), '이 날짜에 각 명단의 첫 번째 사람이 섭니다. 한 번 정하면 웬만하면 바꾸지 마세요.'],
    ['새벽예배 요일', '월,화,수,목,금,토', '설교자와 방송실을 배정할 요일'],
    ['수요저녁 요일', '수', '수요저녁 현관 담당을 배정할 요일']
  ];
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1, 1, 3).setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(2, 2).setNumberFormat('@');
  sh.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold');
  sh.getRange(2, 2, rows.length - 1, 1).setBackground('#fff2cc');
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 170);
  sh.setColumnWidth(3, 460);
  sh.getRange(1, 3, rows.length, 1).setWrap(true);
  return true;
}

function ceSetupRotation() {
  if (ceSheet(CE_TAB.ROTATION, false)) return false;
  var sh = ceSheet(CE_TAB.ROTATION, true);
  sh.getRange(1, 1, 1, 3).setValues([['설교', '방송', '수요현관']])
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center');
  sh.getRange(2, 1, 1, 3).setValues([['여기부터 이름을', '한 줄에 한 명씩', '순서대로 적으세요']])
    .setFontColor('#999999').setFontStyle('italic');
  sh.getRange(6, 1, 1, 3).merge()
    .setValue('위에서 아래 순서대로 돌아갑니다. 중간에 이름을 끼워 넣거나 빼면 그 뒤 순서가 밀립니다.')
    .setFontColor('#666666');
  for (var c = 1; c <= 3; c++) sh.setColumnWidth(c, 140);
  sh.setFrozenRows(1);
  return true;
}

function ceSetupLeave() {
  if (ceSheet(CE_TAB.LEAVE, false)) return false;
  var sh = ceSheet(CE_TAB.LEAVE, true);
  sh.getRange(1, 1, 1, 5).setValues([['이름', '시작일', '종료일', '역할', '사유']])
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(2, 1, 1, 5).setValues([['(예) 홍길동', '2026-09-07', '2026-09-12', '전체', '휴가']])
    .setFontColor('#999999').setFontStyle('italic');
  sh.getRange(2, 2, 200, 2).setNumberFormat('@');

  var roleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['전체', '설교', '방송', '수요현관'], true)
    .setAllowInvalid(true).build();
  sh.getRange(2, 4, 200, 1).setDataValidation(roleRule);

  sh.getRange(1, 6).setValue('며칠 이상 이어지는 휴가는 여기에 한 줄로 적으면 됩니다. 하루짜리는 [달력] 탭이 더 편합니다.')
    .setFontColor('#666666');
  sh.setColumnWidth(1, 110);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 110);
  sh.setColumnWidth(4, 90);
  sh.setColumnWidth(5, 160);
  sh.setFrozenRows(1);
  return true;
}
