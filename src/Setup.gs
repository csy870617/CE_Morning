/**
 * 처음 한 번 실행해서 필요한 탭을 만들어 두는 코드.
 * 이미 있는 탭은 건드리지 않습니다.
 */

/**
 * 설정 탭에 있어야 할 항목들.  [이름, 기본값, 설명, 예전에 쓰던 이름들]
 * 없으면 채워 넣고, 예전 이름으로 적혀 있으면 새 이름으로 바꿔 줍니다.
 * 설명은 초기 설정을 다시 누를 때마다 최신 내용으로 맞춥니다 (값은 건드리지 않습니다).
 */
var CE_SETTING_ROWS = [
  ['로테이션 시작일', null,
    '이 날짜에 각 명단의 첫 번째 사람이 섭니다. 배정은 늘 이 날짜부터 다시 계산하므로, ' +
    '바꾸면 그 뒤 모든 달의 순서가 함께 밀립니다. 한 번 정하면 웬만하면 바꾸지 마세요.',
    []],
  ['새벽예배 요일', '월,화,수,목,금,토',
    '설교자와 방송실을 배정할 요일. 여기서 뺀 요일은 표에서 빈 칸으로 남습니다. ' +
    '주일(일)은 넣지 마세요.',
    []],
  ['토요 별도 요일', '토',
    '이 요일은 [토요설교]·[토요방송] 명단으로 따로 돌립니다. ' +
    '두 명단을 비워 두면 평일 명단으로 그냥 이어서 돕니다. ' +
    '방송실 교대도 토요일끼리만 일어납니다.',
    ['토요별도 요일']],
  ['수요백업 요일', '수',
    '[수요백업] 담당을 배정할 요일. 표 넷째 줄 [수요/토요] 의 이 요일 칸에 들어갑니다. ' +
    '[현관안내] 날짜도 이 요일로 잡습니다.',
    ['수요현관 요일', '수요저녁 요일']],
  ['토요백업 요일', '토',
    '[토요백업] 담당을 배정할 요일. 같은 넷째 줄의 이 요일 칸에 들어갑니다.',
    ['토요찬양 요일']]
];

function ceSetupAll() {
  var created = [];
  var updated = [];
  var renamed = ceRenameLegacyTabs();
  ceRemoveQtTab();                // 예전 '생명의 삶' 탭은 이제 쓰지 않습니다
  try {
    ceRemoveQtTrigger();          // 체크박스로 창을 띄우던 트리거도 걷어냅니다
  } catch (err) {
    // 못 지워도 나머지는 그대로 됩니다.
  }

  if (ceSetupSettings()) created.push(CE_TAB.SETTINGS);
  else ceDescribeUpgrade(CE_TAB.SETTINGS, ceUpgradeSettings(), '항목', updated);

  if (ceSetupRotation()) created.push(CE_TAB.ROTATION);
  else ceDescribeUpgrade(CE_TAB.ROTATION, ceUpgradeRotation(), '명단', updated);

  if (!ceSheet(CE_TAB.CALENDAR, false)) {
    var today = new Date();
    ceRenderCalendar(today.getFullYear(), today.getMonth() + 1);
    created.push(CE_TAB.CALENDAR);
  }
  ceOrderTabs(null);

  return { created: created, updated: updated, renamed: renamed };
}

/** 보완한 내용을 사람이 읽을 한 줄씩으로 옮겨 담습니다. */
function ceDescribeUpgrade(tab, up, what, out) {
  if (up.added.length) {
    out.push(tab + ': ' + what + ' ' + up.added.join(', ') + ' 추가');
  }
  if (up.renamed.length) {
    out.push(tab + ': 이름 변경 ' + up.renamed.join(', '));
  }
  if (up.refreshed.length) {
    out.push(tab + ': 설명 ' + up.refreshed.length + '개를 최신 내용으로 맞춤');
  }
  return out;
}

/**
 * 이미 있는 설정 탭을 손봅니다.
 *  - 빠진 항목은 아래에 덧붙입니다
 *  - 예전 이름으로 적힌 항목은 새 이름으로 바꿉니다
 *  - 설명은 늘 최신 내용으로 맞춥니다
 * 적어 두신 [값] 은 어느 경우에도 건드리지 않습니다.
 */
function ceUpgradeSettings() {
  var sh = ceSheet(CE_TAB.SETTINGS, false);
  if (!sh) return { added: [], renamed: [], refreshed: [] };

  var lastRow = Math.max(sh.getLastRow(), 1);
  var rowOf = {};
  var values = sh.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] == null ? '' : values[i][0]).trim();
    if (key && !rowOf[key]) rowOf[key] = i + 1;
  }

  var added = [];
  var renamed = [];
  var refreshed = [];
  for (var r = 0; r < CE_SETTING_ROWS.length; r++) {
    var def = CE_SETTING_ROWS[r];
    var name = def[0], note = def[2], aliases = def[3] || [];

    var at = rowOf[name] || 0;
    var oldName = '';
    for (var a = 0; a < aliases.length && !at; a++) {
      if (rowOf[aliases[a]]) { at = rowOf[aliases[a]]; oldName = aliases[a]; }
    }

    if (!at) {
      lastRow++;
      sh.getRange(lastRow, 1, 1, 3)
        .setValues([[name, def[1] == null ? ceDefaultAnchor() : def[1], note]]);
      sh.getRange(lastRow, 1).setFontWeight('bold');
      sh.getRange(lastRow, 2).setBackground('#fff2cc').setNumberFormat('@');
      sh.getRange(lastRow, 3).setWrap(true);
      added.push(name);
      continue;
    }

    if (oldName) {
      sh.getRange(at, 1).setValue(name).setFontWeight('bold');
      renamed.push(oldName + ' → ' + name);
    }
    if (String(sh.getRange(at, 3).getValue() || '').trim() !== note) {
      sh.getRange(at, 3).setValue(note).setWrap(true);
      refreshed.push(name);
    }
  }

  // 설명이 길어졌으니 읽을 수 있게 폭을 맞춰 둡니다.
  if (added.length || renamed.length || refreshed.length) {
    sh.setColumnWidth(1, 140);
    sh.setColumnWidth(3, 520);
  }
  return { added: added, renamed: renamed, refreshed: refreshed };
}

/**
 * 이미 있는 로테이션 탭을 손봅니다.
 *  - 빠진 명단 열을 채워 넣습니다. 안내 문구 뒤 멀찍이 붙으면 못 보고 지나치기
 *    쉬우므로 기존 명단 열 바로 다음 자리에 끼워 넣습니다
 *  - 뜻이 달라진 예전 머리글(수요현관·토요찬양)은 새 이름으로 바꿉니다
 *  - 머리글 메모는 늘 최신 내용으로 맞춥니다
 * 적어 두신 이름은 어느 경우에도 건드리지 않습니다.
 */
function ceUpgradeRotation() {
  var sh = ceSheet(CE_TAB.ROTATION, false);
  if (!sh) return { added: [], renamed: [], refreshed: [] };

  var found = ceRotationColumnMap(sh);
  var fresh = ceRefreshRotationHeaders(sh, found);
  var lastNameCol = 0;
  for (var key in found) {
    if (Object.prototype.hasOwnProperty.call(found, key)) {
      lastNameCol = Math.max(lastNameCol, found[key]);
    }
  }

  var added = [];
  var col = lastNameCol + 1;
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) {
    var def = CE_ROTATION_COLUMNS[i];
    if (found[def.key]) continue;

    // 그 자리에 뭔가 적혀 있으면(안내 문구 등) 열을 새로 끼워 넣어 밀어냅니다.
    if (ceColumnHasContent(sh, col)) sh.insertColumnBefore(col);

    sh.getRange(1, col).setValue(def.header)
      .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
      .setFontWeight('bold').setHorizontalAlignment('center');
    sh.getRange(1, col).setNote(def.note || '');
    sh.setColumnWidth(col, 130);
    added.push(def.header);
    col++;
  }
  return { added: added, renamed: fresh.renamed, refreshed: fresh.refreshed };
}

/**
 * 이미 있는 머리글의 이름과 메모를 최신으로 맞춥니다.
 * '설교자'·'방송실' 처럼 그냥 다르게 쓰신 이름은 그대로 두고,
 * 뜻이 달라진 예전 이름(수요현관·토요찬양)만 바꿉니다.
 */
function ceRefreshRotationHeaders(sh, found) {
  var renamed = [];
  var refreshed = [];
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) {
    var def = CE_ROTATION_COLUMNS[i];
    var col = found[def.key];
    if (!col) continue;

    var now = ceNormalizeHeader(sh.getRange(1, col).getValue());
    var olds = def.renameFrom || [];
    for (var o = 0; o < olds.length; o++) {
      if (now !== ceNormalizeHeader(olds[o])) continue;
      sh.getRange(1, col).setValue(def.header);
      renamed.push(olds[o] + ' → ' + def.header);
      break;
    }
    var note = def.note || '';
    if (String(sh.getRange(1, col).getNote() || '').trim() !== note) {
      sh.getRange(1, col).setNote(note);
      refreshed.push(def.header);
    }
  }
  return { renamed: renamed, refreshed: refreshed };
}

function ceColumnHasContent(sh, col) {
  var lastRow = sh.getLastRow();
  if (lastRow < 1 || col > sh.getMaxColumns()) return false;
  var values = sh.getRange(1, col, lastRow, 1).getValues();
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0] == null ? '' : values[r][0]).trim() !== '') return true;
  }
  return false;
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

  var rows = [['항목', '값', '설명']];
  for (var i = 0; i < CE_SETTING_ROWS.length; i++) {
    var r = CE_SETTING_ROWS[i];
    rows.push([r[0], r[1] == null ? ceDefaultAnchor() : r[1], r[2]]);
  }

  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1, 1, 3).setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(2, 2, rows.length - 1, 1).setNumberFormat('@').setBackground('#fff2cc');
  sh.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 170);
  sh.setColumnWidth(3, 520);
  sh.getRange(1, 3, rows.length, 1).setWrap(true);
  return true;
}

function ceSetupRotation() {
  if (ceSheet(CE_TAB.ROTATION, false)) return false;
  var sh = ceSheet(CE_TAB.ROTATION, true);

  var headers = CE_ROTATION_COLUMNS.map(function (d) { return d.header; });
  var n = headers.length;
  sh.getRange(1, 1, 1, n).setValues([headers])
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center');

  for (var i = 0; i < n; i++) {
    sh.getRange(1, i + 1).setNote(CE_ROTATION_COLUMNS[i].note || '');
  }

  // 안내 문구는 명단 열 바깥에 둡니다. 명단 열에 있으면 사람 이름으로 읽혀 버립니다.
  var guide = n + 2;
  sh.getRange(1, guide).setValue('2행부터 한 줄에 한 명씩, 설 순서대로 적으세요.')
    .setFontColor('#666666').setFontWeight('bold');
  sh.getRange(2, guide).setValue('위에서 아래로 돌아갑니다. 중간에 이름을 끼워 넣거나 빼면 그 뒤 순서가 밀립니다.')
    .setFontColor('#666666');
  sh.getRange(3, guide).setValue('명단마다 인원 수는 서로 달라도 됩니다. 빈 칸은 알아서 건너뜁니다.')
    .setFontColor('#666666');
  sh.getRange(4, guide).setValue('머리글 이름으로 찾으므로 열 순서는 바꾸셔도 됩니다.')
    .setFontColor('#666666');

  for (var c = 1; c <= n; c++) sh.setColumnWidth(c, 130);
  sh.setColumnWidth(guide, 420);
  sh.setFrozenRows(1);
  return true;
}
