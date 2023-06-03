import { sortKeysByReference } from '@bscotch/utility';
import { Yy, type YyResourceType } from '@bscotch/yy';
import vscode from 'vscode';
import { config } from './extension.config.mjs';

export class StitchYyFormatProvider
  implements vscode.DocumentFormattingEditProvider
{
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    if (document.languageId !== 'yy' || !config.enableYyFormatting) {
      console.warn("Not a yy file, shouldn't format");
      return;
    }
    const parts = document.uri.path.split(/[\\/]+/);
    const name = parts.at(-1)!;
    const type = name.endsWith('.yyp')
      ? 'project'
      : (parts.at(-3) as YyResourceType);
    const text = document.getText();
    const start = document.positionAt(0);
    const end = document.positionAt(text.length);
    const parsed = sortKeysByReference(Yy.parse(text, type), Yy.parse(text));
    const edit = new vscode.TextEdit(
      new vscode.Range(start, end),
      Yy.stringify(parsed),
    );
    return [edit];
  }
}