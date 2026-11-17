import { expressionParts, type CallBinding } from '../../lib/exam-recall';
export default function CallExpressionView({ binding, role }: { binding: CallBinding; role: string }) {
  const { expression } = binding;
  return <div className="lab-call-expression"><div className="lab-call-expression-title"><strong>{role}</strong><span>{expression.title}</span></div><p className="english lab-call-text">{expressionParts(expression.text).map((part, i) => part.variable ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>)}</p><dl><dt>何时能用</dt><dd>{binding.applies}</dd><dt>需替换或核对</dt><dd>{binding.variables}</dd></dl>{binding.example && <details><summary>熟悉的例句</summary><p className="english lab-call-text">{binding.example}</p></details>}{(expression.notes || expression.substitutions) && <details><summary>表达库说明与变体</summary><p className="lab-call-text">{expression.notes}</p><p className="english lab-call-text">{expression.substitutions}</p></details>}</div>;
}
