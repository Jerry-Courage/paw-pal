# Bugfix Requirements Document

## Introduction

After a user runs the AI humanizer on an assignment containing mathematical or scientific content, the exported document (PDF, DOCX, or TXT) contains raw LaTeX syntax — e.g. `\frac{a}{b}`, `\sqrt{x}`, `\alpha`, `\int_{0}^{\infty}` — rendered as literal text rather than human-readable symbols. This makes exported documents unsuitable for academic submission. The fix must convert all LaTeX math expressions into readable Unicode/plaintext equivalents in both export paths (`AssignmentViewSet._export_pdf` and the standalone `export_assignment` function view) across all three export formats (PDF, DOCX, TXT).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the `ai_response` field contains inline math delimiters (`$...$` or `\(...\)`) surrounding a LaTeX expression THEN the system renders the raw LaTeX syntax literally in the exported document instead of converting it to readable symbols.

1.2 WHEN the `ai_response` field contains display math delimiters (`$$...$$` or `\[...\]`) surrounding a LaTeX expression THEN the system renders the raw block-level LaTeX syntax literally in the exported document instead of converting it to readable symbols.

1.3 WHEN the `ai_response` field contains LaTeX Greek letter commands (e.g. `\alpha`, `\beta`, `\pi`, `\omega`) outside or inside math delimiters THEN the system outputs the raw command string instead of the corresponding Unicode symbol.

1.4 WHEN the `ai_response` field contains LaTeX fraction commands (`\frac{a}{b}`) THEN the system outputs the raw command string (e.g. `\frac{1}{2}`) instead of a readable form (e.g. `1/2`).

1.5 WHEN the `ai_response` field contains LaTeX square root commands (`\sqrt{x}`) THEN the system outputs the raw command string instead of a readable form using the `√` symbol (e.g. `√x`).

1.6 WHEN the `ai_response` field contains LaTeX summation or integral commands (e.g. `\sum`, `\int`) with superscript/subscript notation (e.g. `\int_{0}^{\infty}`) THEN the system outputs the raw command strings instead of readable Unicode equivalents (e.g. `∫₀^∞`).

1.7 WHEN the `ai_response` field contains LaTeX math operators or relations (e.g. `\times`, `\div`, `\leq`, `\geq`, `\neq`, `\infty`, `\cdot`) THEN the system outputs the raw command strings instead of the corresponding Unicode symbols.

1.8 WHEN exporting as DOCX or TXT format and the `ai_response` field contains any LaTeX math expression THEN the system writes the raw LaTeX syntax into the document instead of converting it to readable text.

### Expected Behavior (Correct)

2.1 WHEN the `ai_response` field contains inline math delimiters (`$...$` or `\(...\)`) surrounding a LaTeX expression THEN the system SHALL strip the delimiters and convert the inner expression to its Unicode/readable equivalent before writing it to the exported document.

2.2 WHEN the `ai_response` field contains display math delimiters (`$$...$$` or `\[...\]`) surrounding a LaTeX expression THEN the system SHALL strip the delimiters and convert the inner expression to its Unicode/readable equivalent, presented on its own line, before writing it to the exported document.

2.3 WHEN the `ai_response` field contains LaTeX Greek letter commands (e.g. `\alpha`, `\beta`, `\pi`, `\omega`) THEN the system SHALL replace each command with the corresponding Unicode character (e.g. `α`, `β`, `π`, `ω`).

2.4 WHEN the `ai_response` field contains LaTeX fraction commands (`\frac{a}{b}`) THEN the system SHALL replace the command with a readable plaintext form `(a/b)`.

2.5 WHEN the `ai_response` field contains LaTeX square root commands (`\sqrt{x}`) THEN the system SHALL replace the command with the readable form `√(x)` using the Unicode square root symbol.

2.6 WHEN the `ai_response` field contains LaTeX summation or integral commands with limit notation THEN the system SHALL replace them with readable Unicode forms (e.g. `\int_{0}^{\infty}` → `∫₀^∞`, `\sum_{i=1}^{n}` → `Σᵢ₌₁ⁿ`).

2.7 WHEN the `ai_response` field contains LaTeX math operators or relations THEN the system SHALL replace each with the corresponding Unicode symbol (e.g. `\times` → `×`, `\div` → `÷`, `\leq` → `≤`, `\geq` → `≥`, `\neq` → `≠`, `\infty` → `∞`, `\cdot` → `·`).

2.8 WHEN exporting as DOCX or TXT format and the `ai_response` field contains any LaTeX math expression THEN the system SHALL apply the same LaTeX-to-Unicode conversion before writing content into the document.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the `ai_response` field contains no LaTeX math expressions and no math delimiters THEN the system SHALL CONTINUE TO export the document with the original text unmodified.

3.2 WHEN the `ai_response` field contains standard Markdown formatting (bold, italic, headers, bullet lists, numbered lists) and no LaTeX THEN the system SHALL CONTINUE TO render the Markdown correctly in the exported PDF.

3.3 WHEN exporting as PDF using either the `AssignmentViewSet.download_intelligence` action or the standalone `export_assignment` view THEN the system SHALL CONTINUE TO produce a valid, well-structured PDF with correct typography, headers, footer, and page numbering.

3.4 WHEN exporting as DOCX using either export path THEN the system SHALL CONTINUE TO produce a valid `.docx` file with the assignment title as the document heading.

3.5 WHEN exporting as TXT using either export path THEN the system SHALL CONTINUE TO produce a valid plain-text file containing the assignment title and content.

3.6 WHEN a user who is not the assignment owner and not a workspace member attempts to export an assignment THEN the system SHALL CONTINUE TO return a 403 Unauthorized response.

3.7 WHEN the `ai_response` field contains text that uses dollar signs in a non-math context (e.g. `$100`, `$USD`) and the content is clearly not a LaTeX math expression THEN the system SHALL CONTINUE TO preserve the original text without corrupting it.

---

## Bug Condition

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type string (ai_response text)
  OUTPUT: boolean

  // Returns true when the text contains any LaTeX math content
  RETURN ContainsMathDelimiters(X)     // $...$, $$...$$, \(...\), \[...\]
      OR ContainsLatexCommands(X)      // \frac, \sqrt, \alpha, \int, \sum, \times, etc.
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Fix Checking — LaTeX is converted to readable form
FOR ALL X WHERE isBugCondition(X) DO
  result ← export'(X)    // export after the fix
  ASSERT NOT ContainsRawLatexSyntax(result)
  ASSERT IsHumanReadable(result)
END FOR
```

### Preservation Property

```pascal
// Property: Preservation Checking — non-LaTeX content is unaffected
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT export(X) = export'(X)    // output identical before and after fix
END FOR
```
