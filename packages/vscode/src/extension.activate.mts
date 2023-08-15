import { Asset, Code } from '@bscotch/gml-parser';
import { GameMakerFolder } from 'tree.folder.mjs';
import vscode from 'vscode';
import { swallowThrown } from './assert.mjs';
import { stitchEvents } from './events.mjs';
import { StitchCompletionProvider } from './extension.completions.mjs';
import { config } from './extension.config.mjs';
import {
  createCopyAsJsdocSelfCallback,
  createCopyAsJsdocTypeCallback,
  createCopyAsTypeCallback,
} from './extension.copyType.mjs';
import { StitchDefinitionsProvider } from './extension.definitions.mjs';
import { StitchYyFormatProvider } from './extension.formatting.mjs';
import { GameMakerHoverProvider } from './extension.hover.mjs';
import { StitchWorkspaceSymbolProvider } from './extension.symbols.mjs';
import type { StitchWorkspace } from './extension.workspace.mjs';
import { GameMakerInspectorProvider } from './inspector.mjs';
import { findProject, pathyFromUri, registerCommand } from './lib.mjs';
import { Timer, info, logger, warn } from './log.mjs';
import { GameMakerTreeProvider } from './tree.mjs';

export async function activateStitchExtension(
  workspace: StitchWorkspace,
  ctx: vscode.ExtensionContext,
) {
  info('Activating extension...');
  const t = Timer.start();
  // Ensure that things stay up to date!

  // Dispose any existing subscriptions
  // to allow for reloading the extension
  ctx.subscriptions.forEach((s) => s.dispose());

  workspace.clearProjects();

  info('Loading projects...');
  const yypFiles = await vscode.workspace.findFiles(`**/*.yyp`);
  if (!yypFiles.length) {
    warn('No .yyp files found in workspace!');
  }
  for (const yypFile of yypFiles) {
    info('Loading project', yypFile);
    const pt = Timer.start();
    try {
      await workspace.loadProject(
        yypFile,
        workspace.emitDiagnostics.bind(workspace),
      );
      pt.seconds('Loaded project in');
    } catch (error) {
      logger.error('Error loading project', yypFile, error);
      vscode.window.showErrorMessage(
        `Could not load project ${pathyFromUri(yypFile).basename}`,
      );
    }
  }
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{gml,yy,yyp}');

  const treeProvider = new GameMakerTreeProvider(workspace);
  const inspectorProvider = new GameMakerInspectorProvider(workspace);
  const definitionsProvider = new StitchDefinitionsProvider(workspace);

  ctx.subscriptions.push(
    // vscode.window.onDidChangeActiveTextEditor((editor) => {
    //   if (!editor) {
    //     return;
    //   }
    //   const code = provider.getGmlFile(editor.document);
    // }),
    vscode.workspace.onDidChangeTextDocument((event) =>
      workspace.onChangeDoc(event),
    ),
    vscode.workspace.onDidOpenTextDocument((event) => {
      // provider.onChangeDoc(event),
    }),
    watcher.onDidCreate((uri) => {
      workspace.externalChangeTracker.addChange({ uri, type: 'create' });
    }),
    watcher.onDidDelete((uri) => {
      workspace.externalChangeTracker.addChange({ uri, type: 'delete' });
    }),
    watcher.onDidChange((uri) => {
      workspace.externalChangeTracker.addChange({ uri, type: 'change' });
    }),
    ...treeProvider.register(),
    ...inspectorProvider.register(),
    definitionsProvider.register(),
    GameMakerHoverProvider.register(workspace),
    StitchWorkspaceSymbolProvider.register(workspace),
    StitchCompletionProvider.register(workspace),
    vscode.languages.registerSignatureHelpProvider('gml', workspace, '(', ','),
    vscode.languages.registerDocumentFormattingEditProvider(
      'yy',
      new StitchYyFormatProvider(),
    ),
    vscode.languages.registerReferenceProvider('gml', workspace),
    registerCommand('stitch.assets.delete', (what) => {
      // Convert the incoming argument to an Asset, then emit the event
      let asset: Asset | undefined;
      if (what && typeof what === 'object') {
        if (what instanceof Asset) {
          asset = what;
        } else if ('asset' in what && what.asset instanceof Asset) {
          asset = what.asset;
        }
      }
      if (!asset) {
        logger.warn('stitch.assets.delete called on unknown type', what);
        return;
      }
      workspace.deleteAsset(asset);
    }),
    registerCommand('stitch.assets.deleteCode', async (what) => {
      // Convert the incoming argument to a Code instance, then emit the event
      let code: Code | undefined;
      if (what && typeof what === 'object') {
        if (what instanceof Code) {
          code = what;
        } else if ('code' in what && what.code instanceof Code) {
          code = what.code;
        }
      }
      // Actually delete the code!
      if (!code) {
        logger.warn('stitch.assets.deleteCode called on unknown type', what);
        return;
      }
      await code.remove();
      stitchEvents.emit('code-file-deleted', code);
    }),
    registerCommand('stitch.types.copy', createCopyAsTypeCallback(workspace)),
    registerCommand(
      'stitch.types.copyAsJsdocSelf',
      createCopyAsJsdocSelfCallback(workspace),
    ),
    registerCommand(
      'stitch.types.copyAsJsdocType',
      createCopyAsJsdocTypeCallback(workspace),
    ),
    registerCommand('stitch.run', (uriOrFolder: string[] | GameMakerFolder) => {
      const project = findProject(workspace, uriOrFolder);
      if (!project) {
        void vscode.window.showErrorMessage('No project found to run!');
        return;
      }
      project.run();
    }),
    registerCommand(
      'stitch.clean',
      (uriOrFolder: string[] | GameMakerFolder) => {
        const project = findProject(workspace, uriOrFolder);
        if (!project) {
          void vscode.window.showErrorMessage('No project found to run!');
          return;
        }
        project.run({ clean: true });
      },
    ),
    registerCommand('stitch.openIde', (...args) => {
      const uri = vscode.Uri.parse(
        args[0] || vscode.window.activeTextEditor?.document.uri.toString(),
      );
      workspace.getProject(uri)?.openInIde();
    }),
    workspace.semanticHighlightProvider.register(),
    workspace.signatureHelpStatus,
    vscode.window.onDidChangeTextEditorSelection((e) => {
      // This includes events from the output window, so skip those
      if (e.textEditor.document.uri.scheme !== 'file') {
        return;
      }
      workspace.signatureHelpStatus.text = '';
      workspace.signatureHelpStatus.hide();
      if (!config.enableFunctionSignatureStatus) {
        return;
      }
      // If something is actually selected, versus
      // just the cursor being in a position, then
      // we don't want to do anything.
      if (e.selections.length !== 1) {
        return;
      }
      // Get the signature helper.
      const signatureHelp = swallowThrown(
        () =>
          workspace.provideSignatureHelp(
            e.textEditor.document,
            e.selections[0].start,
          )!,
      );
      if (!signatureHelp) {
        return;
      }
      // Update the status bar with the signature.
      // We can't do any formatting, so we'll need
      // to upper-case the current parameter.
      const signature = signatureHelp.signatures[signatureHelp.activeSignature];
      const name = signature.label.match(/^function\s+([^(]+)/i)?.[1];
      if (!name) {
        return;
      }
      const asString = `${name}(${signature.parameters
        .map((p, i) => {
          if (
            typeof p.label === 'string' &&
            i === signatureHelp.activeParameter
          ) {
            return p.label.toUpperCase();
          }
          return p.label;
        })
        .join(', ')})`;
      workspace.signatureHelpStatus.text = asString;
      workspace.signatureHelpStatus.show();
    }),
    workspace.diagnosticCollection,
  );

  t.seconds('Extension activated in');
  return workspace;
}
