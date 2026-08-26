/**
 * "생명의 삶" 탭 - 두란노 QT 묵상 달력으로 건너가는 자리.
 *
 * 구글 시트의 탭 안에는 웹페이지를 띄울 수 없습니다. 셀에는 값과 이미지만
 * 들어갑니다. 그래서 두 가지를 둡니다.
 *
 *   1) 이 탭의 링크 - 누르면 브라우저 새 탭에서 열립니다. 항상 됩니다.
 *   2) 메뉴 [생명의 삶 열기] - 시트 위에 큰 창을 띄워 그 안에 페이지를 넣습니다.
 *      브라우저가 서드파티 쿠키를 막고 있으면 로그인 화면이 뜰 수 있습니다.
 */

function ceSetupQt() {
  if (ceSheet(CE_TAB.QT, false)) return false;
  var sh = ceSheet(CE_TAB.QT, true);

  sh.getRange(1, 1, 1, 4).merge()
    .setValue('생명의 삶 · 묵상 달력')
    .setBackground(CE_COLOR.TITLE_BG).setFontColor('#ffffff')
    .setFontSize(13).setFontWeight('bold').setHorizontalAlignment('center');

  sh.getRange(3, 1, 1, 4).merge()
    .setFormula('=HYPERLINK("' + CE_QT_URL + '","생명의 삶 묵상 달력 열기  ▶")')
    .setBackground('#588fad').setFontColor('#ffffff')
    .setFontSize(12).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(3, 44);

  var lines = [
    '위 칸을 누르면 브라우저 새 탭에서 열립니다.',
    '',
    '메뉴 [새벽예배 배정 → 생명의 삶 열기] 를 쓰면 시트를 벗어나지 않고',
    '창 안에서 볼 수 있습니다. 다만 브라우저가 다른 사이트 쿠키를 막고 있으면',
    '창 안에 로그인 화면이 뜰 수 있습니다. 그럴 때는 위 링크로 여세요.',
    '',
    '두란노 로그인은 브라우저에 한 번 해 두시면 계속 유지됩니다.',
    '이 시트에는 아이디와 비밀번호를 넣지 않았습니다.'
  ];
  sh.getRange(5, 1, lines.length, 1).setValues(lines.map(function (t) { return [t]; }))
    .setFontColor('#666666');

  sh.setColumnWidth(1, 520);
  for (var c = 2; c <= 4; c++) sh.setColumnWidth(c, 60);
  return true;
}

/** 시트 위에 큰 창을 띄워 그 안에 묵상 달력을 넣습니다. */
function ceShowQt() {
  var html = '<style>html,body{margin:0;padding:0;height:100%;font-family:sans-serif}' +
    'iframe{width:100%;height:calc(100% - 30px);border:0}' +
    'p{margin:0;padding:6px 8px;font-size:12px;color:#666;height:18px;overflow:hidden}' +
    'a{color:#1155cc}</style>' +
    '<p>창 안에 로그인 화면이 뜨면 ' +
    '<a href="' + CE_QT_URL + '" target="_blank">브라우저에서 직접 열기</a> 를 눌러 주세요.</p>' +
    '<iframe src="' + CE_QT_URL + '"></iframe>';

  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(1000).setHeight(700),
    '생명의 삶 · 묵상 달력');
}
