/**
 * 처음 한 번 실행해서 필요한 탭을 만들어 두는 코드.
 * 이미 있는 탭은 건드리지 않습니다.
 */

function ceSetupAll() {
  var created = [];
  if (ceSetupSettings()) created.push(CE_TAB.SETTINGS);
  if (ceSetupRotation()) created.push(CE_TAB.ROTATION);

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
  // 안내 문구는 A~C열 바깥(E열)에 둡니다. A~C열에 있으면 명단으로 읽혀 버립니다.
  sh.getRange(1, 5).setValue('2행부터 한 줄에 한 명씩, 설 순서대로 적으세요.')
    .setFontColor('#666666').setFontWeight('bold');
  sh.getRange(2, 5).setValue('위에서 아래로 돌아갑니다. 중간에 이름을 끼워 넣거나 빼면 그 뒤 순서가 밀립니다.')
    .setFontColor('#666666');
  sh.getRange(3, 5).setValue('세 명단의 인원 수는 서로 달라도 됩니다. 빈 칸은 알아서 건너뜁니다.')
    .setFontColor('#666666');
  sh.getRange(1, 1, 1, 3).setNote('이 열에는 이름만 적어 주세요. 메모나 안내 문구를 적으면 사람 이름으로 읽힙니다.');
  for (var c = 1; c <= 3; c++) sh.setColumnWidth(c, 140);
  sh.setColumnWidth(5, 420);
  sh.setFrozenRows(1);
  return true;
}
