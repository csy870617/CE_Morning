/* 시트에 붙는 코드를 껍데기 시트 위에서 한 번 끝까지 돌려 봅니다.
   node test/sheets.test.js  */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeContext } = require('./fakeSheets');

const FILES = ['Rotation.gs', 'Sheets.gs', 'Calendar.gs', 'Render.gs', 'Qt.gs', 'Setup.gs', 'Menu.gs'];

function load() {
  const made = makeContext();
  const { ss, globals } = made;
  const ctx = vm.createContext(globals);
  ctx.__dialogs = () => made.shownDialogs;
  ctx.__alerts = made.alerts;       // ui.alert 로 띄운 글
  ctx.__menus = made.menus;         // 상단 메뉴 구성
  ctx.__prompt = made.promptAnswer; // ui.prompt 에 돌려줄 답
  FILES.forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), ctx, { filename: f });
  });
  return { ctx, ss };
}

/* vm 안에서 만들어진 배열·객체는 프로토타입이 달라 deepStrictEqual 이 걸립니다. */
const plain = v => JSON.parse(JSON.stringify(v));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('  FAIL  ' + name + '\n        ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n        ') : e));
    process.exitCode = 1;
  }
}

/** 초기 설정 + 명단 입력까지 끝낸 시트를 만들어 돌려줍니다. */
function prepared(rotationColumns) {
  const { ctx, ss } = load();
  ctx.ceSetupAll();

  const settings = ss.getSheetByName('설정');
  for (let r = 1; r <= settings.getLastRow(); r++) {
    if (String(settings._get(r, 1)).trim() === '로테이션 시작일') settings._set(r, 2, '2026-08-31');
  }

  const rot = ss.getSheetByName('로테이션');
  const headers = rot.getRange(1, 1, 1, rot.getLastColumn()).getValues()[0];
  Object.keys(rotationColumns).forEach(header => {
    const col = headers.indexOf(header) + 1;
    assert.ok(col > 0, '머리글을 못 찾음: ' + header);
    rotationColumns[header].forEach((name, i) => rot._set(2 + i, col, name));
  });
  return { ctx, ss };
}

/**
 * 안내가 하나도 뜨지 않을 만큼 넉넉히 채운 명단.
 */
function fullRotations() {
  return {
    '설교': ['설1', '설2', '설3', '설4', '설5', '설6', '설7'],
    '방송': ['방1', '방2', '방3', '방4', '방5', '방6', '방7'],
    '토요설교': ['토설1', '토설2'],
    '토요방송': ['토방1', '토방2'],
    '수요백업': ['수백1', '수백2'],
    '토요백업': ['토백1', '토백2'],
    '휴일(설교)': ['휴설1', '휴설2'],
    '휴일(백업)': ['휴백1', '휴백2'],
    '현관안내': ['안1', '안2', '안3', '안4', '안5', '안6', '안7']
  };
}

/** 월별 시트에서 한 줄을 읽어 옵니다. base 는 그 주 블록의 Date 줄. */
function readRow(sheet, base, offset) {
  return sheet.getRange(base + offset, 2, 1, 6).getValues()[0].map(v => String(v));
}

test('초기 설정이 필요한 탭과 열을 모두 만든다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  ['설정', '로테이션', '달력(예외자)'].forEach(n => assert.ok(ss.getSheetByName(n), n + ' 탭이 없다'));
  const rot = ss.getSheetByName('로테이션');
  const headers = rot.getRange(1, 1, 1, rot.getLastColumn()).getValues()[0];
  ['설교', '방송', '토요설교', '토요방송', '수요백업', '토요백업',
    '휴일(설교)', '휴일(백업)', '현관안내']
    .forEach(h => assert.ok(headers.indexOf(h) >= 0, h + ' 열이 없다'));
});

test('설정 탭에 새 항목이 다 들어간다', () => {
  const { ctx } = load();
  ctx.ceSetupAll();
  const cfg = ctx.ceReadConfig();
  assert.deepStrictEqual(plain(cfg.dawnDows), [1, 2, 3, 4, 5, 6]);
  assert.deepStrictEqual(plain(cfg.satDows), [6]);
  assert.deepStrictEqual(plain(cfg.doorDows), [3]);
  assert.deepStrictEqual(plain(cfg.praiseDows), [6]);
});

test('명단을 머리글 이름으로 읽는다 (열 순서를 바꿔도)', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  const rot = ss.getSheetByName('로테이션');
  rot.clear();
  // 일부러 순서를 뒤집고 사이에 빈 열을 둡니다
  rot._set(1, 1, '토요찬양'); rot._set(2, 1, '서집사');
  rot._set(1, 3, '설교'); rot._set(2, 3, '김목사'); rot._set(3, 3, '이목사');
  rot._set(1, 4, '방송실'); rot._set(2, 4, '정집사');
  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사', '이목사']);
  assert.deepStrictEqual(plain(read.broadcast), ['정집사']);
  assert.deepStrictEqual(plain(read.praise), ['서집사']);
  assert.deepStrictEqual(plain(read.satSermon), []);
});

test('예전 3열짜리 로테이션 탭에 빠진 열을 덧붙인다', () => {
  const { ctx, ss } = load();
  const rot = ss.insertSheet('로테이션');
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '방송'); rot._set(2, 2, '정집사');
  rot._set(1, 3, '수요현관'); rot._set(2, 3, '오권사');

  const up = ctx.ceUpgradeRotation();
  assert.deepStrictEqual(plain(up.added),
    ['토요설교', '토요방송', '토요백업', '휴일(설교)', '휴일(백업)', '현관안내']);
  assert.deepStrictEqual(plain(up.renamed), ['수요현관 → 수요백업']);
  assert.strictEqual(rot.getRange(1, 3).getValue(), '수요백업', '예전 머리글은 새 이름으로 바뀐다');

  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사']);
  assert.deepStrictEqual(plain(read.door), ['오권사'], '기존 수요현관이 다른 명단으로 잘못 읽히면 안 된다');
  assert.deepStrictEqual(plain(read.satSermon), []);
});

test('예전 머리글은 새 이름으로 바꾸고, 그냥 다르게 쓴 이름은 그대로 둔다', () => {
  const { ctx, ss } = load();
  const rot = ss.insertSheet('로테이션');
  rot._set(1, 1, '설교자'); rot._set(2, 1, '김목사');   // 변형 이름 - 그대로 둔다
  rot._set(1, 2, '방송실'); rot._set(2, 2, '정집사');   // 변형 이름 - 그대로 둔다
  rot._set(1, 3, '수요현관'); rot._set(2, 3, '오권사'); // 뜻이 달라진 이름 - 바꾼다
  rot._set(1, 4, '토요찬양'); rot._set(2, 4, '서집사'); // 뜻이 달라진 이름 - 바꾼다

  const up = ctx.ceUpgradeRotation();
  assert.deepStrictEqual(plain(up.renamed), ['수요현관 → 수요백업', '토요찬양 → 토요백업']);
  assert.strictEqual(rot.getRange(1, 1).getValue(), '설교자', '쓰시던 이름은 건드리지 않는다');
  assert.strictEqual(rot.getRange(1, 2).getValue(), '방송실', '쓰시던 이름은 건드리지 않는다');
  assert.strictEqual(rot.getRange(1, 3).getValue(), '수요백업');
  assert.strictEqual(rot.getRange(1, 4).getValue(), '토요백업');

  // 적어 둔 이름은 그대로 읽힌다
  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.door), ['오권사']);
  assert.deepStrictEqual(plain(read.praise), ['서집사']);
});

test('머리글 메모를 최신 설명으로 맞춘다', () => {
  const { ctx, ss } = load();
  const rot = ss.insertSheet('로테이션');
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '수요현관'); rot._set(2, 2, '오권사');
  rot.notes.set('1,2', '수요저녁 백업 명단. 표 넷째 줄 수요일 칸에 들어갑니다.');  // 예전 메모

  ctx.ceUpgradeRotation();
  assert.ok(String(rot.notes.get('1,1')).indexOf('평일 새벽 설교자') >= 0, rot.notes.get('1,1'));
  assert.ok(String(rot.notes.get('1,2')).indexOf('겹쳐도') >= 0,
    '예전 메모가 최신 설명으로 바뀐다: ' + rot.notes.get('1,2'));
  // 새로 끼워 넣은 열에도 메모가 붙는다
  const cols = ctx.ceReadRotations()._columns;
  assert.ok(String(rot.notes.get('1,' + cols.usher)).indexOf('세 명씩') >= 0,
    rot.notes.get('1,' + cols.usher));
});

test('새 명단 열은 기존 명단 바로 옆에 들어간다 (안내 문구 뒤로 밀리지 않게)', () => {
  const { ctx, ss } = load();
  // 예전 버전이 만들던 모습 그대로: A~C 명단, E열에 안내 문구
  const rot = ss.insertSheet('로테이션');
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '방송'); rot._set(2, 2, '정집사');
  rot._set(1, 3, '수요현관'); rot._set(2, 3, '오권사');
  rot._set(1, 5, '2행부터 한 줄에 한 명씩, 설 순서대로 적으세요.');
  rot._set(2, 5, '위에서 아래로 돌아갑니다.');

  ctx.ceUpgradeRotation();

  const headers = rot.getRange(1, 1, 1, rot.getLastColumn()).getValues()[0];
  assert.deepStrictEqual(plain(headers.slice(0, 9)),
    ['설교', '방송', '수요백업', '토요설교', '토요방송', '토요백업',
      '휴일(설교)', '휴일(백업)', '현관안내']);
  // 안내 문구는 오른쪽으로 밀렸을 뿐 사라지지 않는다
  assert.ok(String(rot._get(1, 10)).indexOf('2행부터') === 0, '안내 문구가 보존되어야 한다');
  // 기존 이름도 그대로
  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사']);
  assert.deepStrictEqual(plain(read.door), ['오권사']);
});

test('토요 명단이 비어 있으면 평일 명단으로 돌았다고 알려 준다', () => {
  const { ctx } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  const out = ctx.ceGenerateMonth(2026, 9);
  const joined = out.notes.join('\n');
  assert.ok(joined.indexOf('[토요설교]') >= 0, '토요설교 안내가 있어야 한다');
  assert.ok(joined.indexOf('[토요방송]') >= 0, '토요방송 안내가 있어야 한다');
  assert.ok(joined.indexOf('[토요백업]') >= 0);
  assert.ok(joined.indexOf('[수요백업]') >= 0);
});

test('명단을 다 채우면 안내가 사라진다', () => {
  const { ctx } = prepared(fullRotations());
  ctx.ceRenderCalendar(2026, 9);          // 달력을 배정할 달로 맞춰 둔다
  const out = ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(out.notes), []);
});

test("예전 '수요저녁 요일' 설정을 그대로 알아본다", () => {
  const { ctx, ss } = load();
  const set = ss.insertSheet('설정');
  set._set(1, 1, '항목'); set._set(1, 2, '값');
  set._set(2, 1, '로테이션 시작일'); set._set(2, 2, '2026-08-31');
  set._set(3, 1, '새벽예배 요일'); set._set(3, 2, '월,화,수,목,금,토');
  set._set(4, 1, '수요저녁 요일'); set._set(4, 2, '수');

  const cfg = ctx.ceReadConfig();
  assert.deepStrictEqual(plain(cfg.doorDows), [3]);
  assert.deepStrictEqual(plain(cfg.praiseDows), [6], '없는 항목은 기본값으로 채운다');

  const up = ctx.ceUpgradeSettings();
  assert.ok(up.added.indexOf('수요백업 요일') < 0, '예전 이름이 있으면 새 이름을 또 만들지 않는다');
  assert.ok(up.added.indexOf('토요백업 요일') >= 0);
  assert.ok(up.added.indexOf('토요 별도 요일') >= 0);
  // 예전 이름 칸은 새 이름으로 바뀌고 값은 그대로다
  assert.strictEqual(set.getRange(4, 1).getValue(), '수요백업 요일');
  assert.strictEqual(set.getRange(4, 2).getValue(), '수');
  assert.ok(up.renamed.indexOf('수요저녁 요일 → 수요백업 요일') >= 0, plain(up.renamed).join(', '));
});

test("예전 '수요현관 요일'·'토요찬양 요일' 설정도 그대로 쓴다", () => {
  const { ctx, ss } = load();
  const set = ss.insertSheet('설정');
  set._set(1, 1, '항목'); set._set(1, 2, '값');
  set._set(2, 1, '로테이션 시작일'); set._set(2, 2, '2026-08-31');
  set._set(3, 1, '수요현관 요일'); set._set(3, 2, '수');
  set._set(4, 1, '토요찬양 요일'); set._set(4, 2, '토');

  const cfg = ctx.ceReadConfig();
  assert.deepStrictEqual(plain(cfg.doorDows), [3]);
  assert.deepStrictEqual(plain(cfg.praiseDows), [6]);

  const up = ctx.ceUpgradeSettings();
  assert.ok(up.added.indexOf('수요백업 요일') < 0, '예전 이름이 있으면 새 이름을 또 만들지 않는다');
  assert.ok(up.added.indexOf('토요백업 요일') < 0, '예전 이름이 있으면 새 이름을 또 만들지 않는다');
  assert.strictEqual(set.getRange(3, 1).getValue(), '수요백업 요일');
  assert.strictEqual(set.getRange(4, 1).getValue(), '토요백업 요일');
  assert.strictEqual(set.getRange(3, 2).getValue(), '수', '값은 그대로 둔다');
});

test('설정 설명은 코드가 바뀌면 다시 눌러 최신으로 맞춘다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  const set = ss.getSheetByName('설정');

  // 설명 칸을 예전 문구로 되돌려 놓고
  let row = 0;
  for (let r = 1; r <= set.getLastRow(); r++) {
    if (String(set._get(r, 1)).trim() === '수요백업 요일') row = r;
  }
  assert.ok(row > 0);
  set._set(row, 3, '수요저녁 현관 담당을 배정할 요일');
  const keep = set._get(row, 2);

  const up = ctx.ceUpgradeSettings();
  assert.ok(up.refreshed.indexOf('수요백업 요일') >= 0, plain(up.refreshed).join(', '));
  assert.ok(String(set._get(row, 3)).indexOf('현관안내') >= 0, set._get(row, 3));
  assert.strictEqual(set._get(row, 2), keep, '값은 건드리지 않는다');
  assert.deepStrictEqual(plain(up.added), [], '없는 항목을 또 만들지 않는다');
});

test('고칠 게 없으면 아무것도 바뀌지 않았다고 한다', () => {
  const { ctx } = load();
  ctx.ceSetupAll();
  const up = ctx.ceUpgradeSettings();
  assert.deepStrictEqual(plain(up.added), []);
  assert.deepStrictEqual(plain(up.refreshed), []);
});

test('월별 표를 끝까지 그린다', () => {
  const { ctx, ss } = prepared(fullRotations());

  ctx.ceRenderCalendar(2026, 9);
  const out = ctx.ceGenerateMonth(2026, 9);
  assert.strictEqual(out.sheetName, '2026-09');
  assert.deepStrictEqual(plain(out.warnings), []);

  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(sh.getRange(1, 1).getValue(), '2026년 9월 새벽 설교자 및 백업');
  assert.deepStrictEqual(plain(sh.getRange(2, 2, 1, 6).getValues()[0]), ['월', '화', '수', '목', '금', '토']);

  // 첫 주 블록: 3행 Date / 4행 설교자 / 5행 방송실 / 6행 수요·토요
  assert.strictEqual(sh.getRange(3, 1).getValue(), 'Date');
  assert.strictEqual(sh.getRange(6, 1).getValue(), '수요/토요 서브');
  assert.deepStrictEqual(plain(readRow(sh, 3, 0)), ['31', '1', '2', '3', '4', '5']);

  const preachers = readRow(sh, 3, 1);
  assert.deepStrictEqual(plain(preachers.slice(0, 5)), ['설1', '설2', '설3', '설4', '설5']);
  assert.strictEqual(preachers[5], '토설1', '토요일은 토요설교 명단');

  const broadcast = readRow(sh, 3, 2);
  assert.deepStrictEqual(plain(broadcast.slice(0, 5)), ['방1', '방2', '방3', '방4', '방5']);
  assert.strictEqual(broadcast[5], '토방1', '토요일은 토요방송 명단');

  const special = readRow(sh, 3, 3);
  assert.deepStrictEqual(plain(special), ['', '', '수백1', '', '', '토백1']);
});

/* ---------- 휴일 명단 ---------- */

test("달력에 '휴일' 을 적으면 휴일 명단에서 순서대로 들어간다", () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c1 = findDayCell(cal, 16);
  cal._set(c1.row, c1.col, '휴일');

  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  // 9/16 은 수요일 -> 셋째 블록(Date 줄 11행) 의 D열
  assert.strictEqual(String(sh.getRange(11, 4).getValue()), '16');
  assert.strictEqual(String(sh.getRange(12, 4).getValue()), '휴설1');
  assert.strictEqual(String(sh.getRange(13, 4).getValue()), '휴백1');
});

test('휴일 칸은 연한 빨강으로 칠한다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c1 = findDayCell(cal, 16);
  cal._set(c1.row, c1.col, '휴일');

  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(sh.getRange(12, 4).getBackground(), '#f4cccc');
  assert.strictEqual(sh.getRange(13, 4).getBackground(), '#f4cccc');
});

test('휴일 명단을 비워 두면 그 날은 빈 칸으로 남는다', () => {
  const rots = fullRotations();
  rots['휴일(설교)'] = [];
  rots['휴일(백업)'] = [];
  const { ctx, ss } = prepared(rots);
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c1 = findDayCell(cal, 16);
  cal._set(c1.row, c1.col, '휴일');

  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(String(sh.getRange(12, 4).getValue()), '');
  assert.strictEqual(sh.notes.get('12,4'), '휴일 — 직접 입력하세요');
});

/* ---------- 현관안내 (I열) ---------- */

test("I열 머리글은 '현관안내(수,토)' 이고, 블록마다 수·토 날짜가 붙는다", () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(sh.getRange(2, 9).getValue(), '현관안내(수,토)');
  assert.deepStrictEqual([3, 7, 11, 15, 19].map(r => String(sh.getRange(r, 9).getValue())),
    ['(2,5)', '(9,12)', '(16,19)', '(23,26)', '(30,3)']);
});

test('I열에는 블록마다 현관안내 세 명이 순서대로 들어간다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const read = base => [1, 2, 3].map(i => String(sh.getRange(base + i, 9).getValue()));
  assert.deepStrictEqual(read(3), ['안1', '안2', '안3']);
  assert.deepStrictEqual(read(7), ['안4', '안5', '안6']);
  assert.deepStrictEqual(read(11), ['안7', '안1', '안2']);
});

test('I열 칸 색은 표와 같다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  // 머리글 줄과 블록 네 줄 모두 B열(표) 과 같은 바탕색
  [2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(r => {
    assert.strictEqual(sh.backgrounds.get(r + ',9'), sh.backgrounds.get(r + ',2'),
      r + '행 I열 색이 표와 다르다');
  });
});

test('I열 현관안내에 그 주 수요/토요 서브 이름이 들어가지 않는다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  // 블록마다 Date 줄은 3, 7, 11, 15, 19. 넷째 줄(수요/토요 서브)은 base+3.
  [3, 7, 11, 15, 19].forEach(base => {
    const special = sh.getRange(base + 3, 2, 1, 6).getValues()[0].map(v => String(v)).filter(Boolean);
    const ushers = [1, 2, 3].map(i => String(sh.getRange(base + i, 9).getValue()));
    special.forEach(name => {
      assert.ok(ushers.indexOf(name) < 0,
        base + '행 블록: ' + name + ' 이 수요/토요 서브와 현관안내에 함께 들어갔다');
    });
  });
});

test('겹침을 빼서 세 명을 못 채우면 그 칸에 이유를 적는다', () => {
  const rots = fullRotations();
  rots['수요백업'] = ['안1'];
  rots['토요백업'] = ['안2'];
  rots['현관안내'] = ['안1', '안2', '안3'];
  const { ctx, ss } = prepared(rots);
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  assert.strictEqual(String(sh.getRange(4, 9).getValue()), '안3');
  assert.strictEqual(String(sh.getRange(5, 9).getValue()), '');
  const note = String(sh.notes.get('5,9') || '');
  assert.ok(note.indexOf('세 명 다 채우지 못했습니다') >= 0, note);
  assert.ok(note.indexOf('수요백업·토요백업') >= 0, '왜 못 채웠는지 적어야 한다: ' + note);
  assert.strictEqual(sh.getRange(5, 9).getBackground(), '#ea9999');
});

test('현관안내 명단이 비면 안내만 하고 표는 그린다', () => {
  const rots = fullRotations();
  rots['현관안내'] = [];
  const { ctx, ss } = prepared(rots);
  const out = ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(sh.getRange(2, 9).getValue(), '현관안내(수,토)');
  assert.strictEqual(String(sh.getRange(4, 9).getValue()), '');
  assert.ok(out.notes.join(' ').indexOf('현관안내') >= 0, plain(out.notes).join(' '));
});

test('마지막 주까지 다섯 블록이 다 그려진다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  // 5주 x 4줄, 3행부터 -> 마지막 블록의 Date 줄은 19행
  assert.deepStrictEqual(plain(readRow(sh, 19, 0)), ['28', '29', '30', '1', '2', '3']);
  assert.ok(String(sh.getRange(19 + 1, 2).getValue()).length > 0);
});

test('같은 달을 두 번 그려도 결과가 같다', () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사', '박전도사'], '방송': ['정집사', '한집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요백업': ['오권사'], '토요백업': ['서집사']
  });
  ctx.ceGenerateMonth(2026, 9);
  const first = ss.getSheetByName('2026-09').getRange(3, 1, 20, 7).getValues();
  ctx.ceGenerateMonth(2026, 9);
  const second = ss.getSheetByName('2026-09').getRange(3, 1, 20, 7).getValues();
  assert.deepStrictEqual(plain(second), plain(first));
});

test('달력에 적은 휴가가 배정에 반영된다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사', '박전도사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);

  // 9/1 은 화요일 -> 첫 주(8/30~9/5) 이름 줄에서 화요일 칸
  const cal = ss.getSheetByName('달력(예외자)');
  const dateRow = 4;
  let col = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(dateRow, c)) === '1') col = c;
  assert.ok(col > 0, '9/1 칸을 찾지 못함');
  cal._set(dateRow + 1, col, '이목사');

  const out = ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const preachers = readRow(sh, 3, 1);
  assert.strictEqual(preachers[0], '김목사');           // 8/31
  assert.strictEqual(preachers[1], '박전도사');         // 9/1 이목사 건너뜀
  assert.strictEqual(preachers[2], '김목사');           // 9/2
});

test("달력에 '휴일' 을 적으면 그 날 칸이 비고 순번이 유지된다", () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사', '박전도사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);

  const cal = ss.getSheetByName('달력(예외자)');
  let col = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(4, c)) === '1') col = c;
  cal._set(5, col, '휴일');

  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const preachers = readRow(sh, 3, 1);
  assert.strictEqual(preachers[0], '김목사');   // 8/31
  assert.strictEqual(preachers[1], '');         // 9/1 휴일
  assert.strictEqual(preachers[2], '이목사');   // 순번이 소모되지 않았다
  assert.strictEqual(sh.notes.get(`${4},${2 + 1}`), '휴일 — 직접 입력하세요');
});

/** 달력 격자에서 그 날짜가 들어 있는 이름 칸 좌표를 찾습니다. */
function findDayCell(cal, day) {
  for (let r = 4; r <= 20; r += 2) {
    for (let c = 1; c <= 7; c++) {
      if (String(cal._get(r, c)) === String(day)) return { row: r + 1, col: c };
    }
  }
  throw new Error(day + '일 칸을 찾지 못했습니다');
}

test('달을 옮겼다 돌아오면 적어 둔 내용이 그대로 있다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');

  const sep1 = findDayCell(cal, 1);
  cal._set(sep1.row, sep1.col, '김목사');

  ctx.ceRenderCalendar(2026, 10);
  const oct1 = findDayCell(cal, 1);
  assert.strictEqual(String(cal._get(oct1.row, oct1.col)), '', '적은 적 없는 달은 비어 있다');
  cal._set(oct1.row, oct1.col, '정집사');

  ctx.ceRenderCalendar(2026, 9);
  const back = findDayCell(cal, 1);
  assert.strictEqual(String(cal._get(back.row, back.col)), '김목사', '9월 내용이 돌아와야 한다');

  ctx.ceRenderCalendar(2026, 10);
  const back10 = findDayCell(cal, 1);
  assert.strictEqual(String(cal._get(back10.row, back10.col)), '정집사', '10월 내용도 남아 있어야 한다');
});

test('역할을 적은 것도 그대로 돌아온다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c1 = findDayCell(cal, 2);
  cal._set(c1.row, c1.col, '김목사, 정집사(방송)');

  ctx.ceRenderCalendar(2026, 10);
  ctx.ceRenderCalendar(2026, 9);
  const back = findDayCell(cal, 2);
  assert.strictEqual(String(cal._get(back.row, back.col)), '김목사, 정집사(방송)');
});

test('다른 달을 보고 있어도 그 달 예외가 배정에 반영된다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사', '박전도사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c1 = findDayCell(cal, 1);
  cal._set(c1.row, c1.col, '이목사');

  ctx.ceRenderCalendar(2026, 10);          // 달력은 10월을 보고 있지만
  const out = ctx.ceGenerateMonth(2026, 9);  // 9월을 배정한다

  const sh = ss.getSheetByName('2026-09');
  const preachers = readRow(sh, 3, 1);
  assert.strictEqual(preachers[1], '박전도사', '9/1 이목사가 건너뛰어져야 한다');
  // 달력이 다른 달을 보고 있다는 이유로 경고하지 않는다
  assert.ok(out.notes.every(n => n.indexOf('보고 있습니다') < 0), out.notes.join(' / '));
});

test('달력 저장용 숨김 탭이 생기고 숨겨져 있다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const store = ss.getSheetByName('_달력저장');
  assert.ok(store, '저장 탭이 있어야 한다');
  assert.strictEqual(store.hidden, true);
  assert.deepStrictEqual(plain(ss.visibleNames()), ['달력(예외자)', '로테이션', '설정']);
});

test('명단이 비어 있으면 안내와 함께 멈춘다', () => {
  const { ctx } = load();
  ctx.ceSetupAll();
  assert.throws(() => ctx.ceGenerateMonth(2026, 9), /설교\] 명단이 비어 있습니다/);
});

test('기준일보다 앞선 달은 안내와 함께 멈춘다', () => {
  const { ctx } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  assert.throws(() => ctx.ceGenerateMonth(2026, 1), /로테이션 시작일/);
});


/* ---------- 머리글이 조금 달라도 알아보는지 ---------- */

test('머리글이 조금 달라도 명단을 알아본다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  const rot = ss.getSheetByName('로테이션');
  rot.clear();
  rot._set(1, 1, '설교자'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '방송실'); rot._set(2, 2, '정집사');
  rot._set(1, 3, '토요 설교'); rot._set(2, 3, '강목사');
  rot._set(1, 4, '토요 방송실'); rot._set(2, 4, '임집사');
  rot._set(1, 5, '수요 백업'); rot._set(2, 5, '오권사');
  rot._set(1, 6, '토요 백업'); rot._set(2, 6, '서집사');
  rot._set(1, 7, '휴일(설교)'); rot._set(2, 7, '휴설A');
  rot._set(1, 8, '휴일(백업)'); rot._set(2, 8, '휴백A');
  rot._set(1, 9, '현관안내'); rot._set(2, 9, '안내1');

  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사']);
  assert.deepStrictEqual(plain(read.broadcast), ['정집사']);
  assert.deepStrictEqual(plain(read.satSermon), ['강목사']);
  assert.deepStrictEqual(plain(read.satBroadcast), ['임집사']);
  assert.deepStrictEqual(plain(read.door), ['오권사']);
  assert.deepStrictEqual(plain(read.praise), ['서집사']);
  assert.deepStrictEqual(plain(read.holidaySermon), ['휴설A']);
  assert.deepStrictEqual(plain(read.holidayBroadcast), ['휴백A']);
  assert.deepStrictEqual(plain(read.usher), ['안내1']);
});

test('안내 문구는 머리글로 오인되지 않는다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();
  const rot = ss.getSheetByName('로테이션');
  rot.clear();
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  // '수' 나 '설' 이 들어간 긴 안내 문구
  rot._set(1, 2, '명단마다 인원 수는 서로 달라도 됩니다. 빈 칸은 알아서 건너뜁니다.');
  rot._set(2, 2, '위에서 아래로 돌아갑니다');
  const read = ctx.ceReadRotations();
  assert.deepStrictEqual(plain(read.sermon), ['김목사']);
  assert.deepStrictEqual(plain(read.door), []);
  assert.deepStrictEqual(plain(read.broadcast), []);
});

test('열을 못 찾으면 비어 있는 것과 다르게 알려 준다', () => {
  const { ctx, ss } = load();
  ctx.ceSetupAll();

  const settings = ss.getSheetByName('설정');
  for (let r = 1; r <= settings.getLastRow(); r++) {
    if (String(settings._get(r, 1)).trim() === '로테이션 시작일') settings._set(r, 2, '2026-08-31');
  }

  const rot = ss.getSheetByName('로테이션');
  rot.clear();
  rot._set(1, 1, '설교'); rot._set(2, 1, '김목사');
  rot._set(1, 2, '방송'); rot._set(2, 2, '정집사');
  rot._set(1, 3, '토요설교');            // 열은 있는데 이름이 없음

  const out = ctx.ceGenerateMonth(2026, 9);
  const joined = out.notes.join('\n');
  assert.ok(joined.indexOf('[토요설교] 열(C열)에 이름이 없습니다') >= 0, joined);
  assert.ok(joined.indexOf('[토요방송] 열을') >= 0 && joined.indexOf('찾지 못했습니다') >= 0, joined);
});


test("새벽예배 요일에 '토' 가 없으면 그 이유를 알려 준다", () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사'], '방송': ['정집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요백업': ['오권사'], '토요백업': ['서집사']
  });
  const settings = ss.getSheetByName('설정');
  for (let r = 1; r <= settings.getLastRow(); r++) {
    if (String(settings._get(r, 1)).trim() === '새벽예배 요일') settings._set(r, 2, '월,화,수,목,금');
  }

  const out = ctx.ceGenerateMonth(2026, 9);
  assert.ok(out.notes.join('\n').indexOf('[새벽예배 요일] 에 토요일이 없습니다') >= 0, out.notes.join('\n'));

  // 실제로 토요일 칸이 비어 있는지도 확인
  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(String(sh.getRange(4, 7).getValue()), '', '토요일 설교자 칸');
  assert.strictEqual(String(sh.getRange(5, 7).getValue()), '', '토요일 방송실 칸');
  // 토요찬양은 새벽예배와 무관하므로 그대로 들어간다
  assert.strictEqual(String(sh.getRange(6, 7).getValue()), '서집사');
});


/* ---------- 탭 이름·순서, 누적 기록 ---------- */

test("예전 '달력' 탭은 '달력(예외자)' 로 이름이 바뀐다", () => {
  const { ctx, ss } = load();
  const old = ss.insertSheet('달력');
  old._set(1, 1, '연월');
  old._set(1, 2, '2026-09');

  const renamed = ctx.ceRenameLegacyTabs();
  assert.deepStrictEqual(plain(renamed), ['달력 → 달력(예외자)']);
  assert.ok(ss.getSheetByName('달력(예외자)'), '새 이름 탭이 있어야 한다');
  assert.strictEqual(ss.getSheetByName('달력'), null);
  assert.strictEqual(String(old._get(1, 2)), '2026-09', '내용은 그대로여야 한다');
});

test('탭 순서가 표 → 달력(예외자) → 로테이션 → 설정 이 된다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(ss.visibleNames()),
    ['2026-09', '달력(예외자)', '로테이션', '설정']);
});

test('달이 여러 개면 최근 달이 앞에, 방금 만든 달이 맨 앞에 온다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  ctx.ceGenerateMonth(2026, 11);
  ctx.ceGenerateMonth(2026, 10);        // 마지막으로 만든 것이 맨 앞
  assert.deepStrictEqual(plain(ss.visibleNames()),
    ['2026-10', '2026-11', '2026-09', '달력(예외자)', '로테이션', '설정']);
});

test('쓰지 않는 기록 탭을 만들지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  assert.strictEqual(ss.getSheetByName('_기록'), null, '기록 탭은 더 이상 만들지 않는다');
  assert.deepStrictEqual(plain(ss.visibleNames()),
    ['2026-09', '달력(예외자)', '로테이션', '설정']);
});


/* ---------- 달력 연월 드롭다운 ---------- */

test('달력 연월 목록은 이번 달이 맨 위, 앞뒤 6개월', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const rule = ss.getSheetByName('달력(예외자)').validations.get('1,2');
  assert.ok(rule, 'B1 에 목록이 있어야 한다');
  assert.strictEqual(rule.values.length, 13, '이번 달 + 다음 6 + 지난 6');
  assert.ok(rule.values.every(v => /^\d{4}-\d{2}$/.test(v)), rule.values.slice(0, 3).join(','));

  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const at = off => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + off, 1));
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}`;
  };
  assert.strictEqual(rule.values[0], at(0), '맨 위가 이번 달');
  assert.strictEqual(rule.values[1], at(1), '그 다음이 다음 달');
  assert.strictEqual(rule.values[6], at(6));
  assert.strictEqual(rule.values[7], at(-1), '다음 달들 뒤에 지난 달');
  assert.strictEqual(rule.values[12], at(-6));
});

test('달력을 다시 그리지 않아도 시트를 열면 목록이 걸린다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  const cal = ss.getSheetByName('달력(예외자)');
  cal.validations.clear();
  ctx.ceEnsureCalendarDropdown();
  const rule = cal.validations.get('1,2');
  assert.ok(rule);
  assert.strictEqual(rule.values.length, 13);
});

test('달력 탭이 없으면 목록 걸기를 조용히 넘어간다', () => {
  const { ctx } = load();
  assert.strictEqual(ctx.ceEnsureCalendarDropdown(), false);
});

test('B1 을 바꾸면 그 달 달력이 그려지고, 보던 달 내용은 저장된다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');

  const sep1 = findDayCell(cal, 1);
  cal._set(sep1.row, sep1.col, '김목사');

  // 드롭다운에서 10월을 고른 상황: B1 이 먼저 바뀌고 onEdit 이 뒤따른다
  cal._set(1, 2, '2026-10');
  ctx.onEdit({ range: cal.getRange(1, 2) });

  assert.deepStrictEqual(plain(ctx.ceStoreGetShownMonth()), { year: 2026, month: 10 });
  const oct1 = findDayCell(cal, 1);
  assert.strictEqual(String(cal._get(oct1.row, oct1.col)), '', '10월은 비어 있어야 한다');

  // 저장된 9월 내용이 9/1 로 들어갔는지 (10/1 로 잘못 들어가면 안 된다)
  const stored = plain(ctx.ceReadStoredExceptions());
  assert.deepStrictEqual(stored, [{ name: '김목사', start: '2026-09-01', end: '2026-09-01', role: 'ALL' }]);
});

test('달력 아닌 칸을 고쳐도 onEdit 이 아무 일도 하지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  let col = 0;
  for (let c = 1; c <= 7; c++) if (String(cal._get(4, c)) === '1') col = c;
  cal._set(5, col, '김목사');

  ctx.onEdit({ range: cal.getRange(5, col) });          // 이름 칸을 고친 경우
  assert.strictEqual(String(cal._get(5, col)), '김목사', '달력이 다시 그려지면 안 된다');

  const rot = ss.getSheetByName('로테이션');
  ctx.onEdit({ range: rot.getRange(1, 2) });            // 다른 탭
  assert.deepStrictEqual(plain(ctx.ceCalendarYearMonth()), { year: 2026, month: 9 });
});

test('B1 에 알아볼 수 없는 값을 넣으면 달력을 건드리지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사'], '방송': ['정집사'] });
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');

  const snapshot = () => cal.getRange(3, 1, 14, 7).getValues().map(r => r.map(String));
  const before = plain(snapshot());

  cal._set(1, 2, '아무거나');
  ctx.onEdit({ range: cal.getRange(1, 2) });

  assert.deepStrictEqual(plain(snapshot()), before, '격자가 그대로여야 한다');
});


/* ---------- 명단에 없는 이름(오타) 알림 ---------- */

test('달력에 명단에 없는 이름이 있으면 배정 안내로 알려 준다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 1);
  cal._set(c.row, c.col, '김목사님');          // 명단에는 '김목사'

  const out = ctx.ceGenerateMonth(2026, 9);
  const joined = out.notes.join('\n');
  assert.ok(joined.indexOf('김목사님') >= 0, joined);
  assert.ok(joined.indexOf('명단에 없는 이름') >= 0, joined);
});

test('이름이 맞으면 아무 말도 하지 않는다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 1);
  cal._set(c.row, c.col, '설1');

  const out = ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(out.notes), []);
});

test("'휴일' 은 명단에 없어도 알리지 않는다", () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceRenderCalendar(2026, 9);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 1);
  cal._set(c.row, c.col, '휴일');

  const out = ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(out.notes), []);
});

test('다른 달에 적힌 오타는 이번 달 배정에서 알리지 않는다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceRenderCalendar(2026, 11);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 10);
  cal._set(c.row, c.col, '없는사람');

  const out = ctx.ceGenerateMonth(2026, 9);
  assert.deepStrictEqual(plain(out.notes), [], out.notes.join(' / '));
});


/* ---------- 이름 체크박스로 강조하기 ---------- */

function pickerRows(sh, lastTableRow) {
  // 표 아래 안내줄 다음부터 이름/체크박스 줄이 짝으로 이어집니다.
  return { label: lastTableRow + 2, firstName: lastTableRow + 3, firstCheck: lastTableRow + 4 };
}

test('표 아래에 이름과 체크박스가 깔린다', () => {
  const { ctx, ss } = prepared({
    '설교': ['김목사', '이목사'], '방송': ['정집사', '한집사'],
    '토요설교': ['강목사'], '토요방송': ['임집사'],
    '수요백업': ['오권사'], '토요백업': ['서집사']
  });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  const lastTableRow = 3 + 5 * 4 - 1;          // 5주 x 4줄
  const p = pickerRows(sh, lastTableRow);
  assert.ok(String(sh.getRange(p.label, 1).getValue()).indexOf('설교는 노랑') >= 0,
    String(sh.getRange(p.label, 1).getValue()));

  // 이름 줄에 표에 나온 사람들이 있어야 한다
  const shown = [];
  for (let r = p.firstName; r <= p.firstName + 6; r += 2) {
    for (let c = 2; c <= 7; c++) {
      const v = String(sh._get(r, c)).trim();
      if (v && v !== 'false' && v !== 'true') shown.push(v);
    }
  }
  ['김목사', '이목사', '정집사', '한집사', '강목사', '임집사', '오권사', '서집사']
    .forEach(n => assert.ok(shown.indexOf(n) >= 0, n + ' 이 목록에 없다'));

  // 이름 바로 아래 칸은 체크박스여야 한다
  assert.ok(sh.checkboxes.has(`${p.firstCheck},2`), '첫 이름 아래에 체크박스가 있어야 한다');
});

test('이름은 가나다 순이고 중복이 없다', () => {
  const { ctx, ss } = prepared({
    '설교': ['한목사', '김목사'], '방송': ['김목사', '박집사']   // 김목사가 두 명단에 있음
  });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const p = pickerRows(sh, 3 + 5 * 4 - 1);

  const shown = [];
  for (let c = 2; c <= 7; c++) {
    const v = String(sh._get(p.firstName, c)).trim();
    if (v) shown.push(v);
  }
  assert.deepStrictEqual(plain(shown), ['김목사', '박집사', '한목사']);
});

test('설교자 줄은 노랑, 나머지는 연한 초록 규칙이 걸린다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  const rules = sh.getConditionalFormatRules();
  assert.strictEqual(rules.length, 2, '색깔 두 개짜리 규칙 둘');

  const yellow = rules.filter(r => r.background === '#ffe599')[0];
  const green = rules.filter(r => r.background === '#d9ead3')[0];
  assert.ok(yellow, '노랑 규칙이 있어야 한다');
  assert.ok(green, '연한 초록 규칙이 있어야 한다');

  // 설교자 줄은 각 주 블록의 두 번째 줄: 4, 8, 12, 16, 20
  ['B4:G4', 'B8:G8', 'B12:G12', 'B16:G16', 'B20:G20'].forEach(r => {
    assert.ok(yellow.ranges.indexOf(r) >= 0, r + ' 이 노랑 규칙에 없다');
  });
  // 방송실 + 수요/토요 서브 는 그 아래 두 줄씩, 현관안내는 I열
  ['B5:G6', 'B9:G10', 'B13:G14', 'B17:G18', 'B21:G22',
   'I4:I6', 'I8:I10', 'I12:I14', 'I16:I18', 'I20:I22'].forEach(r => {
    assert.ok(green.ranges.indexOf(r) >= 0, r + ' 이 초록 규칙에 없다');
  });
  // 설교자 줄이 초록에, 방송실 줄이 노랑에 섞여 들어가지 않는다
  assert.ok(green.ranges.indexOf('B4:G4') < 0, '설교자 줄이 초록에도 걸렸다');
  assert.ok(yellow.ranges.indexOf('B5:G6') < 0, '방송실 줄이 노랑에도 걸렸다');
});

test('조건식이 자리에 휘둘리지 않도록 지금 칸을 가리킨다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const rules = ss.getSheetByName('2026-09').getConditionalFormatRules();
  rules.forEach(r => {
    assert.ok(r.formula.indexOf('INDIRECT(ADDRESS(ROW(),COLUMN()))') > 0, r.formula);
    assert.ok(r.formula.indexOf('COUNTIFS') > 0, r.formula);
    assert.ok(r.formula.indexOf('TRUE') > 0, r.formula);
  });
  // 두 규칙의 조건은 같고 색만 다르다
  assert.strictEqual(rules[0].formula, rules[1].formula);
});

test('이름 칸은 설교자와 같은 노랑으로 물든다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const rules = sh.getConditionalFormatRules();
  const yellow = rules.filter(r => r.background === '#ffe599')[0];
  const green = rules.filter(r => r.background === '#d9ead3')[0];
  assert.ok(yellow.ranges.indexOf('B25:D25') >= 0, plain(yellow.ranges).join(','));
  assert.ok(green.ranges.indexOf('B25:D25') < 0, '이름 칸이 초록에도 걸렸다');
});

test('다시 만들면 규칙이 겹쳐 쌓이지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  assert.strictEqual(sh.getConditionalFormatRules().length, 2);
});

test('아래 설명줄은 이름 목록보다 뒤에 온다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  let footRow = 0;
  for (let r = 20; r <= 40; r++) {
    if (String(sh._get(r, 1)).indexOf('자동 생성') === 0) footRow = r;
  }
  assert.ok(footRow > 0, '설명줄을 찾지 못했다');
  const p = pickerRows(sh, 3 + 5 * 4 - 1);
  assert.ok(footRow > p.firstCheck, '설명줄이 이름 목록 아래여야 한다');
});


/* ---------- 생명의 삶 묵상달력 링크 ---------- */

/** 배정표에서 묵상달력 링크가 있는 줄을 찾습니다. */
function findQtRow(sh) {
  for (let r = 1; r <= 60; r++) {
    // 이제 =HYPERLINK(...) 수식이라 글자가 안쪽에 들어 있습니다.
    if (String(sh._get(r, 1)).indexOf('생명의 삶 묵상달력 열기') >= 0) return r;
  }
  throw new Error('묵상달력 줄을 찾지 못했습니다');
}

test('배정표 아래에 묵상달력 링크가 들어간다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  const row = findQtRow(sh);
  const cell = String(sh._get(row, 1));
  assert.ok(cell.indexOf('=HYPERLINK') === 0, cell);
  assert.ok(cell.indexOf('duranno.com/qt/view/calendar.asp') > 0, cell);
});

test('묵상달력 줄에는 체크박스가 없다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const row = findQtRow(sh);
  for (let c = 1; c <= 7; c++) {
    assert.ok(!sh.checkboxes.has(`${row},${c}`), `${c}열에 체크박스가 남아 있다`);
  }
});

test('체크박스로 창을 띄우던 트리거를 걷어낸다', () => {
  const { ctx } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  const ScriptApp = ctx.ScriptApp;
  ScriptApp.newTrigger('ceOnQtCheckbox').forSpreadsheet().onEdit().create();
  ScriptApp.newTrigger('다른것').forSpreadsheet().onEdit().create();
  assert.strictEqual(ScriptApp.getUserTriggers().length, 2);

  ctx.ceGenerateMonth(2026, 9);

  const left = ScriptApp.getUserTriggers().map(t => t.getHandlerFunction());
  assert.deepStrictEqual(plain(left), ['다른것'], '우리 것만 지우고 남의 것은 둔다');
});

test("예전 '생명의 삶' 탭은 지운다", () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  const old = ss.insertSheet('생명의 삶');
  old._set(1, 1, '생명의 삶 · 묵상 달력');

  ctx.ceGenerateMonth(2026, 9);
  assert.strictEqual(ss.getSheetByName('생명의 삶'), null);
});

test('내가 쓰던 다른 내용이 든 같은 이름 탭은 건드리지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  const mine = ss.insertSheet('생명의 삶');
  mine._set(1, 1, '내가 적어 둔 것');

  ctx.ceGenerateMonth(2026, 9);
  assert.ok(ss.getSheetByName('생명의 삶'), '남의 내용은 지우면 안 된다');
  assert.strictEqual(String(mine._get(1, 1)), '내가 적어 둔 것');
});

test('배정표에 아이디나 비밀번호가 들어가지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const dump = ss.getSheetByName('2026-09').getRange(1, 1, 60, 7).getValues().join(' ').toLowerCase();
  ['churcheveryday', 'media1234'].forEach(secret => {
    assert.ok(dump.indexOf(secret) < 0, secret + ' 이 배정표에 들어가 있다');
  });
});


test('예전 체크박스 자리에 글자가 들어가도 규칙이 남지 않는다', () => {
  const { ctx, ss } = prepared({ '설교': ['김목사', '이목사'], '방송': ['정집사'] });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const row = findQtRow(sh);

  // 예전 버전이 A열에 체크박스를 두었던 상황을 흉내 냅니다
  sh.getRange(row, 1).insertCheckboxes();
  assert.ok(sh.checkboxes.has(`${row},1`));

  ctx.ceGenerateMonth(2026, 9);      // 다시 그리면
  const after = findQtRow(sh);
  assert.ok(!sh.checkboxes.has(`${after},1`), '글자가 들어갈 자리에 체크박스 규칙이 남으면 안 된다');
});

test('이름이 줄어들어 체크박스 줄이 짧아져도 규칙이 남지 않는다', () => {
  const { ctx, ss } = prepared({
    '설교': ['가목사', '나목사', '다목사', '라목사', '마목사'],
    '방송': ['바집사', '사집사', '아집사']
  });
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const before = [];
  sh.checkboxes.forEach(k => before.push(k));
  assert.ok(before.length > 4, '처음엔 체크박스가 여럿이어야 한다');

  // 명단을 줄이고 다시 그린다
  const rot = ss.getSheetByName('로테이션');
  const headers = rot.getRange(1, 1, 1, rot.getLastColumn()).getValues()[0];
  const sermonCol = headers.indexOf('설교') + 1;
  for (let r = 2; r <= 6; r++) rot._set(r, sermonCol, '');
  rot._set(2, sermonCol, '가목사');

  ctx.ceGenerateMonth(2026, 9);
  sh.checkboxes.forEach(k => {
    const [r, c] = k.split(',').map(Number);
    const value = sh._get(r, c);
    assert.ok(value === false || value === true,
      `${k} 에 체크박스 규칙이 남았는데 값은 ${JSON.stringify(value)} 이다`);
  });
});

/* ---------- 바뀐 자리에 붙는 메모 ---------- */

/** 실제로 쓰고 계신 명단 (기준일 2026-09-02). */
function realRotations() {
  return {
    '설교': ['김진혁', '김혜성', '이광현', '백주은', '이민희', '최세영', '김진혁',
      '김혜성', '박소영', '이광현', '백주은', '이민희', '최세영'],
    '방송': ['이광현', '최세영', '이민희', '백주은', '이다혜', '김혜성', '김진혁',
      '이광현', '최세영', '이민희', '백주은', '박소영', '김혜성', '김진혁'],
    '토요설교': ['손창민'], '토요방송': ['최세영'],
    '수요백업': ['이민희', '백주은', '박소영', '김혜성', '김진혁', '이광현'],
    '토요백업': ['백주은', '김혜성', '이광현', '이민희']
  };
}

function preparedReal() {
  const made = prepared(realRotations());
  const settings = made.ss.getSheetByName('설정');
  for (let r = 1; r <= settings.getLastRow(); r++) {
    if (String(settings._get(r, 1)).trim() === '로테이션 시작일') settings._set(r, 2, '2026-09-02');
  }
  return made;
}

test('바꾼 자리가 어디인지 배정 직후에도 알려 준다', () => {
  const { ctx } = preparedReal();
  const out = ctx.ceGenerateMonth(2026, 11);
  const notes = plain(out.notes).join('\n');

  assert.ok(notes.indexOf('설교자와 겹쳐서 방송실을 맞바꾼 날') >= 0, notes);
  assert.ok(notes.indexOf('검은 삼각형') >= 0, '어디를 보라고 알려 준다:\n' + notes);

  // 맞바꾼 두 날 중 겹쳤던 쪽만 세므로 상대 날짜는 늘어놓지 않는다
  const line = notes.split('\n').filter(l => l.indexOf('맞바꾼 날') >= 0)[0];
  assert.ok(line, '맞바꾼 날 줄을 찾지 못했다:\n' + notes);
  assert.ok(line.indexOf('11/20') >= 0, line);
  assert.ok(line.indexOf('11/23') < 0, '맞바꾼 상대까지 세면 안 된다: ' + line);
});

test('바꾼 자리가 없으면 그 줄이 나오지 않는다', () => {
  const { ctx } = prepared(fullRotations());
  const out = ctx.ceGenerateMonth(2026, 9);
  const notes = plain(out.notes).join('\n');
  assert.ok(notes.indexOf('순서를 바꾼 날') < 0, notes);
  assert.ok(notes.indexOf('검은 삼각형') < 0, notes);
});

/* ---------- 이름 체크는 한 사람씩만 ---------- */

/** 월별 표의 체크박스 칸 좌표를 모두 찾습니다. */
function checkboxCells(sh) {
  return [...sh.checkboxes].map(k => {
    const [row, col] = k.split(',').map(Number);
    return { row, col, name: String(sh._get(row - 1, col) || '') };
  }).sort((a, b) => a.row - b.row || a.col - b.col);
}

/** 사람이 칸을 체크한 것처럼 onEdit 을 부릅니다. */
function clickCheckbox(ctx, sh, cell, on) {
  sh._set(cell.row, cell.col, on === undefined ? true : on);
  ctx.onEdit({ range: sh.getRange(cell.row, cell.col) });
}

test('다른 사람을 체크하면 먼저 체크한 것이 풀린다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const boxes = checkboxCells(sh);
  assert.ok(boxes.length >= 3, '체크박스가 여러 개 있어야 한다');

  clickCheckbox(ctx, sh, boxes[0]);
  assert.strictEqual(sh._get(boxes[0].row, boxes[0].col), true);

  clickCheckbox(ctx, sh, boxes[1]);
  assert.strictEqual(sh._get(boxes[1].row, boxes[1].col), true, '새로 누른 것은 켜져 있다');
  assert.strictEqual(sh._get(boxes[0].row, boxes[0].col), false, '먼저 누른 것은 풀린다');

  // 켜진 것이 언제나 하나뿐이다
  assert.strictEqual(boxes.filter(b => sh._get(b.row, b.col) === true).length, 1);
});

test('줄이 달라도 한 사람씩만 체크된다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const boxes = checkboxCells(sh);
  const rows = boxes.map(b => b.row).filter((v, i, a) => a.indexOf(v) === i);
  assert.ok(rows.length >= 2, '체크박스 줄이 두 줄 이상이어야 한다: ' + rows.join(','));

  const first = boxes.filter(b => b.row === rows[0])[0];
  const second = boxes.filter(b => b.row === rows[1])[0];
  clickCheckbox(ctx, sh, first);
  clickCheckbox(ctx, sh, second);
  assert.strictEqual(sh._get(second.row, second.col), true);
  assert.strictEqual(sh._get(first.row, first.col), false, '윗줄 체크가 풀려야 한다');
});

test('체크를 풀 때는 다른 칸을 건드리지 않는다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const boxes = checkboxCells(sh);

  clickCheckbox(ctx, sh, boxes[0]);
  clickCheckbox(ctx, sh, boxes[0], false);     // 같은 칸을 다시 눌러 해제
  assert.strictEqual(boxes.filter(b => sh._get(b.row, b.col) === true).length, 0);
});

test('표의 다른 칸을 고쳐도 체크가 풀리지 않는다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const boxes = checkboxCells(sh);
  clickCheckbox(ctx, sh, boxes[0]);

  // 설교자 칸을 손으로 고치는 경우
  sh._set(4, 2, '손으로 적은 이름');
  ctx.onEdit({ range: sh.getRange(4, 2) });
  assert.strictEqual(sh._get(boxes[0].row, boxes[0].col), true, '체크는 그대로여야 한다');
  assert.strictEqual(sh._get(4, 2), '손으로 적은 이름');
});

test('다른 탭의 체크박스는 건드리지 않는다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  const boxes = checkboxCells(sh);
  clickCheckbox(ctx, sh, boxes[0]);

  // 월별 표가 아닌 탭에서 체크하면 월별 표 체크는 그대로다
  const other = ss.insertSheet('내 메모');
  other._set(2, 2, true);
  ctx.onEdit({ range: other.getRange(2, 2) });
  assert.strictEqual(sh._get(boxes[0].row, boxes[0].col), true);
  assert.strictEqual(other._get(2, 2), true);
});

test('달이 둘이면 서로 다른 표의 체크는 서로 간섭하지 않는다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  ctx.ceGenerateMonth(2026, 10);
  const sep = ss.getSheetByName('2026-09');
  const oct = ss.getSheetByName('2026-10');

  const sepBox = checkboxCells(sep)[0];
  const octBox = checkboxCells(oct)[0];
  clickCheckbox(ctx, sep, sepBox);
  clickCheckbox(ctx, oct, octBox);

  assert.strictEqual(sep._get(sepBox.row, sepBox.col), true, '9월 체크는 남아 있어야 한다');
  assert.strictEqual(oct._get(octBox.row, octBox.col), true);
});

test('설명줄에는 색깔만 적고 괄호 설명은 붙이지 않는다', () => {
  const { ctx, ss } = prepared(fullRotations());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');
  let text = '';
  for (let r = 1; r <= sh.getLastRow(); r++) {
    const v = String(sh._get(r, 1) || '');
    if (v.indexOf('이름을 체크하면') === 0) text = v;
  }
  assert.ok(text, '설명줄을 찾지 못했다');
  assert.ok(text.indexOf('노랑') >= 0 && text.indexOf('연한 초록') >= 0, text);
  assert.ok(text.indexOf('(') < 0, '괄호 설명이 남아 있다: ' + text);
  assert.ok(text.indexOf('여러 명') < 0, text);
  assert.ok(text.indexOf('한 사람씩만') < 0, text);
});

/* ---------- 같은 요일 설교는 한 달에 두 번까지 ---------- */

/** 평일이 주 5칸이라 설교 명단이 5명이면 매주 같은 요일에 같은 사람이 섭니다. */
function fiveSermons() {
  const r = fullRotations();
  r['설교'] = ['설1', '설2', '설3', '설4', '설5'];
  return r;
}

test('표에서도 같은 요일 설교가 두 번을 넘지 않는다', () => {
  const { ctx, ss } = prepared(fiveSermons());
  ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  // 첫 블록 월요일부터 날짜를 되살려 그 달 칸만 셉니다
  const first = new Date(Date.UTC(2026, 8, 1));
  const start = new Date(first.getTime() - (first.getUTCDay() - 1) * 86400000);
  const count = {};
  let base = 3, w = 0;
  while (String(sh._get(base, 1)) === 'Date') {
    for (let c = 2; c <= 6; c++) {           // 월~금만 (토요일은 명단이 따로 돕니다)
      const iso = new Date(start.getTime() + (w * 7 + (c - 2)) * 86400000).toISOString().slice(0, 10);
      if (iso.slice(0, 7) !== '2026-09') continue;
      const name = String(sh._get(base + 1, c) || '');
      if (!name) continue;
      const k = c + '/' + name;
      count[k] = (count[k] || 0) + 1;
      assert.ok(count[k] <= 2,
        iso + ' ' + name + ' 가 그 요일에 ' + count[k] + '번 (두 번까지여야 한다)');
    }
    base += 4; w++;
  }
  assert.ok(Object.keys(count).length > 0, '센 칸이 없다');
});

test('바꾼 칸에 메모가 붙고 배정 직후에도 알려 준다', () => {
  const { ctx, ss } = prepared(fiveSermons());
  const out = ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  // 설교자 줄(블록 Date 줄 + 1) 에 메모가 붙는다
  const sermonRows = [4, 8, 12, 16, 20];
  const notes = [...sh.notes.entries()]
    .filter(([k]) => sermonRows.indexOf(Number(k.split(',')[0])) >= 0)
    .map(([, v]) => String(v));
  assert.ok(notes.length > 0, '설교자 줄에 메모가 없다');
  assert.ok(notes.some(n => n.indexOf('설교가 세 번째라') >= 0), notes.join(' | '));
  assert.ok(notes.some(n => n.indexOf('과 순서 바꿈') >= 0), notes.join(' | '));

  const summary = plain(out.notes).join('\n');
  assert.ok(summary.indexOf('같은 요일 설교가 세 번째라 순서를 바꾼 날') >= 0, summary);
  assert.deepStrictEqual(plain(out.warnings), [], '풀렸으면 경고가 없어야 한다');
});

test('못 풀면 진한 빨강과 함께 이유를 알려 준다', () => {
  // 설교 명단이 한 명뿐이면 매일 그 사람이라 요일을 바꿔도 소용이 없다
  const { ctx, ss } = prepared({ '설교': ['설1'], '방송': ['방1', '방2'] });
  const out = ctx.ceGenerateMonth(2026, 9);
  const sh = ss.getSheetByName('2026-09');

  assert.ok(out.warnings.join(' ').indexOf('세 번 이상입니다') >= 0, plain(out.warnings).join(' '));
  assert.ok(out.notes.join(' ').indexOf('명단 인원을 늘리거나 줄이면') >= 0, plain(out.notes).join(' '));
  // 세 번째가 되는 칸이 진한 빨강
  let painted = 0;
  [4, 8, 12, 16, 20].forEach(r => {
    for (let c = 2; c <= 6; c++) if (sh.getRange(r, c).getBackground() === '#ea9999') painted++;
  });
  assert.ok(painted > 0, '못 푼 칸을 진한 빨강으로 표시해야 한다');
});

test('토요일 설교가 되풀이되어도 경고하지 않는다', () => {
  // 토요설교가 한 명이면 그 달 토요일마다 같은 사람입니다. 바꿀 방법이 없으니 알리지 않습니다.
  const { ctx } = prepared(fullRotations());
  const out = ctx.ceGenerateMonth(2026, 9);
  assert.ok(out.warnings.join(' ').indexOf('세 번 이상입니다') < 0, plain(out.warnings).join(' '));
});

/* ---------- 전체 점검에서 찾아 고친 것들 ---------- */

test('앞뒤 달 시트가 겹치는 날짜에서 같은 이름을 쓴다', () => {
  const { ctx, ss } = preparedReal();
  const seen = {};
  let y = 2026, m = 9;
  for (let i = 0; i < 14; i++) {
    const out = ctx.ceGenerateMonth(y, m);
    const sh = ss.getSheetByName(out.sheetName);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const back = first.getUTCDay() === 0 ? 6 : first.getUTCDay() - 1;
    const start = new Date(first.getTime() - back * 86400000);
    let base = 3, w = 0;
    while (String(sh._get(base, 1)) === 'Date') {
      for (let c = 2; c <= 7; c++) {
        const iso = new Date(start.getTime() + (w * 7 + (c - 2)) * 86400000).toISOString().slice(0, 10);
        const cur = [1, 2, 3].map(k => String(sh._get(base + k, c) || '')).join('|');
        if (seen[iso] && seen[iso].v !== cur) {
          assert.fail(iso + ' 가 ' + seen[iso].m + ' 시트와 ' + out.sheetName + ' 시트에서 다르다\n' +
            '  ' + seen[iso].m + ': ' + seen[iso].v + '\n  ' + out.sheetName + ': ' + cur);
        }
        seen[iso] = { m: out.sheetName, v: cur };
      }
      base += 4; w++;
    }
    m++; if (m > 12) { m = 1; y++; }
  }
  assert.ok(Object.keys(seen).length > 300, '비교한 날이 ' + Object.keys(seen).length + '일');
});

test("'휴일(현관안내)' 가 달력을 오가도 역할을 잃지 않는다", () => {
  const { ctx, ss } = preparedReal();
  ctx.ceRenderCalendar(2026, 11);
  const cal = ss.getSheetByName('달력(예외자)');
  const c = findDayCell(cal, 18);
  cal._set(c.row, c.col, '휴일(현관안내)');

  ctx.ceRenderCalendar(2026, 12);
  ctx.ceRenderCalendar(2026, 11);
  const back = findDayCell(ss.getSheetByName('달력(예외자)'), 18);
  assert.strictEqual(String(cal._get(back.row, back.col)), '휴일(현관안내)',
    '역할이 날아가 그냥 휴일이 되면 안 된다');

  // 그 주 I열만 비고 설교·방송은 그대로다
  ctx.ceGenerateMonth(2026, 11);
  const sh = ss.getSheetByName('2026-11');
  let base = 3, ushers = null, sermon = '';
  while (String(sh._get(base, 1)) === 'Date') {
    for (let col = 2; col <= 7; col++) {
      if (String(sh._get(base, col)) === '18') {
        ushers = [1, 2, 3].map(k => String(sh._get(base + k, 9) || ''));
        sermon = String(sh._get(base + 1, col) || '');
      }
    }
    base += 4;
  }
  assert.ok(ushers, '18일을 못 찾았다');
  assert.strictEqual(ushers.join(''), '', '현관안내가 비어야 한다');
  assert.ok(sermon, '설교자는 그대로 있어야 한다');
});

test('역할 이름을 저장할 때 새 이름으로 적는다', () => {
  const { ctx } = load();
  assert.strictEqual(ctx.ceRoleLabel(ctx.CE_ROLE.DOOR), '수요백업');
  assert.strictEqual(ctx.ceRoleLabel(ctx.CE_ROLE.PRAISE), '토요백업');
  assert.strictEqual(ctx.ceRoleLabel(ctx.CE_ROLE.USHER), '현관안내');
  // 적은 것을 그대로 다시 읽을 수 있다
  [ctx.CE_ROLE.SERMON, ctx.CE_ROLE.BROADCAST, ctx.CE_ROLE.DOOR,
    ctx.CE_ROLE.PRAISE, ctx.CE_ROLE.USHER].forEach(role => {
    assert.strictEqual(ctx.ceNormalizeRole(ctx.ceRoleLabel(role)), role,
      ctx.ceRoleLabel(role) + ' 를 다시 읽지 못한다');
  });
  // 예전 이름도 여전히 읽힌다
  assert.strictEqual(ctx.ceNormalizeRole('수요현관'), ctx.CE_ROLE.DOOR);
  assert.strictEqual(ctx.ceNormalizeRole('토요찬양'), ctx.CE_ROLE.PRAISE);
});

test('그 달이 통째로 기준일 앞이면 막는다', () => {
  const { ctx } = preparedReal();            // 기준일 2026-09-02
  // 8월 격자에는 9/2~9/5 가 섞여 있지만, 8월은 통째로 기준일 앞이다
  assert.throws(() => ctx.ceGenerateMonth(2026, 8), /로테이션 시작일/);
  assert.throws(() => ctx.ceGenerateMonth(2026, 1), /로테이션 시작일/);
  // 기준일이 든 달은 만들 수 있다
  const out = ctx.ceGenerateMonth(2026, 9);
  assert.strictEqual(out.sheetName, '2026-09');
});

test('요일 설정에 오타가 나면 빈 표를 만들지 않고 알려 준다', () => {
  const { ctx, ss } = preparedReal();
  const set = ss.getSheetByName('설정');
  const rowOf = key => {
    for (let r = 1; r <= set.getLastRow(); r++) {
      if (String(set._get(r, 1)).trim() === key) return r;
    }
    return 0;
  };
  const row = rowOf('새벽예배 요일');
  assert.ok(row > 0);

  set._set(row, 2, 'Mon,Tue');
  assert.throws(() => ctx.ceReadConfig(), /알아볼 수 없습니다/);
  set._set(row, 2, '일');
  assert.throws(() => ctx.ceReadConfig(), /월~토 중 하나는 있어야/);

  // 주일이 섞여 있으면 빼고 읽는다 (표가 월~토만 보여 주므로)
  set._set(row, 2, '일,월,화,수,목,금,토');
  assert.deepStrictEqual(plain(ctx.ceReadConfig().dawnDows), [1, 2, 3, 4, 5, 6]);

  // 비어 있으면 기본값
  set._set(row, 2, '');
  assert.deepStrictEqual(plain(ctx.ceReadConfig().dawnDows), [1, 2, 3, 4, 5, 6]);
});

/* ---------- 초기 설정 만들기 안내창 ---------- */

/** 8월 버전 시트를 그대로 만들어 둡니다 (예전 이름·예전 설명·_기록 탭). */
function oldVersionSheet() {
  const { ctx, ss } = load();
  const set = ss.insertSheet('설정');
  [['항목', '값', '설명'],
   ['로테이션 시작일', '2026-09-02', '이 날짜에 각 명단의 첫 번째 사람이 섭니다.'],
   ['새벽예배 요일', '월,화,수,목,금,토', '설교자와 방송실을 배정할 요일'],
   ['수요저녁 요일', '수', '수요저녁 현관 담당을 배정할 요일'],
   ['토요찬양 요일', '토', '토요찬양 담당을 배정할 요일. 같은 넷째 줄에 들어갑니다.']
  ].forEach((row, r) => row.forEach((v, c) => set._set(r + 1, c + 1, v)));

  const rot = ss.insertSheet('로테이션');
  [['설교', '김목사'], ['방송', '정집사'], ['수요현관', '오권사'], ['토요찬양', '서집사']]
    .forEach((col, c) => { rot._set(1, c + 1, col[0]); rot._set(2, c + 1, col[1]); });

  ss.insertSheet('_기록')._set(1, 1, '날짜');
  return { ctx, ss, set, rot };
}

test('예전 버전 시트를 올리면 무엇을 고쳤는지 알려 준다', () => {
  const { ctx } = oldVersionSheet();
  ctx.ceMenuSetup();
  const msg = ctx.__alerts ? ctx.__alerts.join('\n') : '';
  assert.ok(msg.indexOf('보완한 내용') >= 0, msg);
  assert.ok(msg.indexOf('수요저녁 요일 → 수요백업 요일') >= 0, msg);
  assert.ok(msg.indexOf('수요현관 → 수요백업') >= 0, msg);
  assert.ok(msg.indexOf('휴일(설교)') >= 0, msg);
  assert.ok(msg.indexOf('설명') >= 0, '설명을 맞췄다고 알려야 한다:\n' + msg);
  assert.ok(msg.indexOf('_기록') >= 0, '쓰지 않는 탭도 알려야 한다:\n' + msg);
});

test('값은 그대로 두고 이름과 설명만 바꾼다', () => {
  const { ctx, set, rot } = oldVersionSheet();
  ctx.ceMenuSetup();
  // 설정: 이름·설명은 바뀌고 값은 그대로
  assert.strictEqual(set._get(4, 1), '수요백업 요일');
  assert.strictEqual(set._get(4, 2), '수');
  assert.ok(String(set._get(4, 3)).indexOf('현관안내') >= 0, set._get(4, 3));
  // 로테이션: 머리글은 바뀌고 적어 둔 이름은 그대로
  assert.strictEqual(rot._get(1, 3), '수요백업');
  assert.strictEqual(rot._get(2, 3), '오권사');
  assert.strictEqual(rot._get(1, 4), '토요백업');
  assert.strictEqual(rot._get(2, 4), '서집사');
  // 설정 값이 살아 있으니 배정도 그대로 된다
  const cfg = ctx.ceReadConfig();
  assert.strictEqual(cfg.anchor, '2026-09-02');
  assert.deepStrictEqual(plain(cfg.doorDows), [3]);
  assert.deepStrictEqual(plain(cfg.praiseDows), [6]);
});

test('두 번 눌러도 고칠 게 없다고 한다', () => {
  const { ctx } = oldVersionSheet();
  ctx.ceMenuSetup();
  ctx.__alerts.length = 0;
  ctx.ceMenuSetup();
  const msg = ctx.__alerts.join('\n');
  assert.ok(msg.indexOf('보완한 내용') < 0, '두 번째에는 고칠 게 없어야 한다:\n' + msg);
  assert.ok(msg.indexOf('이미 모두 있고') >= 0, msg);
});

test('메뉴에는 배정표 만들기와 초기 설정 만들기만 있다', () => {
  const { ctx } = load();
  ctx.onOpen();
  assert.strictEqual(ctx.__menus.length, 1);
  const labels = ctx.__menus[0].items.filter(i => !i.separator).map(i => i.label);
  assert.deepStrictEqual(plain(labels), ['새벽설교 배정표 만들기', '초기 설정 만들기']);
});

console.log('\n' + passed + ' passed');
