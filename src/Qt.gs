/**
 * 생명의 삶(두란노 QT) 묵상 달력.
 *
 * 배정표 맨 아래에 링크를 두고, 누르면 브라우저 새 탭에서 열립니다.
 *
 * 시트 위에 창으로 띄우는 방식도 만들어 봤지만 잘 열리지 않아 걷어냈습니다.
 * 셀은 그냥 눌러도 스크립트가 실행되지 않아 체크박스를 써야 했고, 게다가
 * 편집 트리거에서는 창을 띄우는 것이 막히는 경우가 있습니다.
 *
 * 아이디와 비밀번호는 넣지 않습니다. 브라우저에 로그인해 두시면 그 세션을 씁니다.
 */

var CE_QT_LABEL = '생명의 삶 묵상달력 열기  ▶';

/** 배정표 맨 아래에 묵상 달력 링크를 놓습니다. */
function ceWriteQtLink(sh, row, totalCols) {
  sh.getRange(row, 1, 1, totalCols).merge()
    .setFormula('=HYPERLINK("' + CE_QT_URL + '","' + CE_QT_LABEL + '")')
    .setBackground('#588fad').setFontColor('#ffffff')
    .setFontSize(11).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(row, 34);
  return row;
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

/**
 * 체크박스로 창을 띄우던 시절에 걸어 둔 설치형 트리거를 지웁니다.
 * 함수가 없어졌으므로 그냥 두면 시트를 고칠 때마다 오류가 납니다.
 */
function ceRemoveQtTrigger() {
  var triggers = ScriptApp.getUserTriggers(ceSS());
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'ceOnQtCheckbox') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  return removed;
}
