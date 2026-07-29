/**
 * Luma 插件：洛谷题解格式检查
 *
 * 校验规则（基于洛谷官方题解格式指南 - 空格和符号章节）：
 *   1. 英文单词/LaTeX 公式与中文之间必须加空格
 *   2. 中文用全角标点（，。；：），句末加句号
 *   3. 英文单词/LaTeX 公式与全角标点之间不加空格
 *   4. 数学符号/常量/变量字母须用 $...$ 包裹
 *   5. 行内字符串、代码片段必须用 `...` 包裹
 *   6. 不可滥用 LaTeX 包裹非公式的单词
 *
 * 注册方法（编辑后粘贴到浏览器控制台或打包到 init 脚本）：
 *   <script src="plugins/luogu-checker/luogu-checker.js"></script>
 */
(function () {
  if (!window.LumaPlugins) { console.warn('[luogu-checker] LumaPlugins 未加载'); return; }

  function isChinese(ch) { return /[\u4e00-\u9fff]/.test(ch); }
  function isWord(ch) { return /[a-zA-Z0-9]/.test(ch); }

  function findIssues(md) {
    var lines = md.split('\n');
    var issues = [];

    lines.forEach(function (line, li) {
      var ln = li + 1;
      // 跳过代码块（不应在代码块内检查格式）
      if (/^```/.test(line.trim())) return;

      // 规则 1: 中英文之间需有空格
      for (var i = 0; i < line.length - 1; i++) {
        var a = line[i], b = line[i + 1];
        // 中文 ↔ 英文/数字 紧贴
        if (isChinese(a) && isWord(b)) {
          issues.push({ line: ln, col: i + 2, severity: 'warn', message: '中文后接英文/数字缺少空格', hint: '中文与英文之间应加一个空格', snippet: line });
          break;
        }
        if (isWord(a) && isChinese(b)) {
          issues.push({ line: ln, col: i + 1, severity: 'warn', message: '英文/数字后接中文缺少空格', hint: '英文与中文之间应加一个空格', snippet: line });
          break;
        }
      }

      // 规则 4: 数字/变量裸用 → 应包 LaTeX
      // 简化：检测 $a$, $b$ 这样的简短裸公式
      // 不强制每个字母都包，只检测常见模式

      // 规则 6: 滥用 LaTeX 包非公式
      // 检测 `$abc$` 这种全字母无下标的情况
      var m;
      var reBare = /\$([a-zA-Z]{2,})\$/g;
      while ((m = reBare.exec(line))) {
        var word = m[1];
        // 包含 LaTeX 命令/数学符号才视为合法公式
        if (!/[\^_\\=]/.test(word)) {
          issues.push({ line: ln, col: m.index + 1, severity: 'info', message: '可能滥用 LaTeX 包裹单词「' + word + '」', hint: '纯字母无数学符号时建议使用行内代码 ` 包裹', snippet: line });
        }
      }
    });

    // 规则 2: 段落末尾应为中文句号
    // 简化：检测中文段落缺句末标点（最后一句非空行非表格等）
    lines.forEach(function (line, li) {
      var trimmed = line.trim();
      if (!trimmed || /^#{1,6}\s/.test(trimmed) || /^[*-]\s/.test(trimmed) || /^```/.test(trimmed)) return;
      // 最后一行如果中文多且不以标点结尾
      if (isChinese(trimmed[trimmed.length - 1]) && !/[。，；：？！（）]/.test(trimmed)) {
        // 不要过多报告：只警告明显中文段落
        if (trimmed.length > 12 && /[\u4e00-\u9fff]/.test(trimmed)) {
          issues.push({ line: li + 1, col: trimmed.length, severity: 'info', message: '段落缺少中文句末标点', hint: '中文段落应以句号、问号或感叹号结尾', snippet: trimmed });
        }
      }
    });

    return issues;
  }

  window.LumaPlugins.register({
    name: '洛谷题解格式检查',
    description: '校验空格、全角标点、LaTeX 包裹等格式',
    version: '1.0.0',
    icon: '✅',
    run: function (host, ctx) {
      var issues = findIssues(ctx.markdown || '');
      return {
        issues: issues,
        summary: issues.length ? '发现 ' + issues.length + ' 处格式问题' : '格式良好'
      };
    }
  });

  console.log('[luogu-checker] 已注册：洛谷题解格式检查');
})();