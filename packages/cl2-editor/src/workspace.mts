import { Packed } from '@bscotch/gcdata';
import { pathy } from '@bscotch/pathy';
import vscode from 'vscode';
import { assertInternalClaim, assertLoudly } from './assert.mjs';
import { crashlandsEvents } from './events.mjs';
import { GameChangerFs } from './gc.fs.mjs';
import { StoryFoldingRangeProvider } from './quests.folding.mjs';
import { QuestHoverProvider } from './quests.hover.mjs';
import { QuestTreeProvider } from './quests.mjs';
import { isQuestUri } from './quests.util.mjs';

export class CrashlandsWorkspace {
  static workspace = undefined as CrashlandsWorkspace | undefined;
  protected constructor(
    readonly ctx: vscode.ExtensionContext,
    readonly yypUri: vscode.Uri,
    readonly packed: Packed,
  ) {}
  static async activate(ctx: vscode.ExtensionContext) {
    // Load the Packed data
    const yypFiles = await vscode.workspace.findFiles('**/Crashlands2.yyp');
    assertInternalClaim(
      yypFiles.length < 2,
      'Multiple Crashlands2.yyp files found!',
    );
    if (yypFiles.length === 0) {
      return;
    }

    const packed = await Packed.from(pathy(yypFiles[0].fsPath));
    assertLoudly(packed, 'Could not load packed file');

    this.workspace = new CrashlandsWorkspace(ctx, yypFiles[0], packed);

    ctx.subscriptions.push(
      ...GameChangerFs.register(this.workspace),
      ...StoryFoldingRangeProvider.register(this.workspace),
      ...QuestTreeProvider.register(this.workspace),
      ...QuestHoverProvider.register(this.workspace),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!isQuestUri(event.document.uri)) {
          return;
        }
        crashlandsEvents.emit('quest-updated', event.document.uri);
      }),
    );

    return this.workspace;
  }
}
