/**
 * 생명의 삶(두란노 QT) 묵상 달력.
 *
 * 배정표 맨 아래에 여는 링크를 두고, 메뉴에서는 시트 위 창으로도 열 수 있게 합니다.
 * 구글 시트의 탭 안에는 웹페이지를 띄울 수 없어서 이렇게 합니다.
 *
 * 아이디와 비밀번호는 넣지 않습니다. 브라우저에 로그인해 두시면 그 세션을 씁니다.
 */

/** 배정표 맨 아래에 묵상 달력 여는 줄을 놓습니다. */
function ceWriteQtLink(sh, row, totalCols) {
  sh.getRange(row, 1, 1, totalCols).merge()
    .setFormula('=HYPERLINK("' + CE_QT_URL + '","생명의 삶 묵상달력 열기  \u25B6")')
    .setBackground('#588fad').setFontColor('#ffffff')
    .setFontSize(11).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(row, 34);
  return row;
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

/**
 * 예전에 만들던 '생명의 삶' 탭이 남아 있으면 지웁니다.
 * 우리가 만든 그 탭이 맞는지 제목으로 확인하고 지웁니다.
 */
function ceRemoveQtTab() {
  var ss = ceSS();
  var sh = ss.getSheetByName('생명의 삶');
  if (!sh) return false;
  if (String(sh.getRange(1, 1).getValue()).indexOf('생명의 삶') !== 0) return false;
  ss.deleteSheet(sh);
  return true;
}
