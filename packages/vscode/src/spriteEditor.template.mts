import { type Asset } from '@bscotch/gml-parser';
import fsp from 'node:fs/promises';
import vscode from 'vscode';
import spineEditorHtml from '../webviews/spine-editor.html';
import spriteEditorHtml from '../webviews/sprite-editor.html';
import { stitchConfig } from './config.mjs';

export interface SpriteInfo {
  name: string;
  width: number;
  height: number;
  xorigin: number;
  yorigin: number;
  frameUrls: string[];
  initialMinWidth: number;
}

export interface SpineSpriteInfo {
  name: string;
  width: number;
  height: number;
  xorigin: number;
  yorigin: number;
  spine: {
    atlas: string;
    json: string;
  };
  /** To get around URI management in the webpage, just create data URLs. Fields are the filenames, which should exactly match the filenames in the 'spine' section */
  spineDataUris: {
    [key: string]: string;
  };
}

function compileRegularSprite(
  sprite: Asset<'sprites'>,
  panel: vscode.WebviewPanel,
) {
  const data: SpriteInfo = {
    name: sprite.name,
    width: sprite.yy.width,
    height: sprite.yy.height,
    xorigin: sprite.yy.sequence.xorigin,
    yorigin: sprite.yy.sequence.yorigin,
    frameUrls: sprite.framePaths.map((p) =>
      panel.webview.asWebviewUri(vscode.Uri.file(p.absolute)).toString(),
    ),
    initialMinWidth: stitchConfig.initialMinSpriteEditorWidth,
  };
  // Inject into the HTML
  const html = spriteEditorHtml
    .replace(
      '<!-- VSCODE-INJECT-DATA -->',
      `<script>window.sprite = ${JSON.stringify(data)};</script>`,
    )
    .replace(
      './sprite-editor.js',
      panel.webview
        .asWebviewUri(
          vscode.Uri.file(
            stitchConfig.context.extensionPath + '/webviews/sprite-editor.js',
          ),
        )
        .toString(),
    );
  return html;
}

async function compileSpineSprite(
  sprite: Asset<'sprites'>,
  panel: vscode.WebviewPanel,
): Promise<string> {
  const { atlas, json } = sprite.spinePaths!;
  const data: SpineSpriteInfo = {
    name: sprite.name,
    width: sprite.yy.width,
    height: sprite.yy.height,
    xorigin: sprite.yy.sequence.xorigin,
    yorigin: sprite.yy.sequence.yorigin,
    spine: {
      // Use the basenames since we'll be using data urls
      atlas: atlas.basename,
      json: json.basename,
    },
    spineDataUris: {},
  };

  // Add the atlas and json data URIs
  const atlasContent = await fsp.readFile(atlas.absolute);
  const jsonContent = await fsp.readFile(json.absolute);

  data.spineDataUris[
    atlas.basename
  ] = `data:application/octet-stream;base64,${atlasContent.toString('base64')}`;
  data.spineDataUris[
    json.basename
  ] = `data:application/json;base64,${jsonContent.toString('base64')}`;

  // Discover the PNGs and their data URIs
  await Promise.all(
    atlasContent
      .toString('utf8')
      .split(/[\r\n]+/)
      .filter((line) => line.match(/^.*\.png$/))
      .map((name) => atlas.up().join(name))
      .map(async (path) => {
        if (!(await path.exists())) return;
        const imageContent = await fsp.readFile(path.absolute);
        data.spineDataUris[
          path.basename
        ] = `data:image/png;base64,${imageContent.toString('base64')}`;
      }),
  );

  // const spineSummary = spineJson
  //   ? await new Spine(spineJson).summarize()
  //   : undefined;
  // Inject into the HTML
  const html = spineEditorHtml
    .replace(
      '<!-- VSCODE-INJECT-DATA -->',
      `<script>window.sprite = ${JSON.stringify(data)};</script>`,
    )
    .replace(
      './spine-editor.js',
      panel.webview
        .asWebviewUri(
          vscode.Uri.file(
            stitchConfig.context.extensionPath + '/webviews/spine-editor.js',
          ),
        )
        .toString(),
    );
  return html;
}

export async function compile(
  sprite: Asset<'sprites'>,
  panel: vscode.WebviewPanel,
) {
  if (sprite.isSpineSprite) {
    return await compileSpineSprite(sprite, panel);
  }
  return compileRegularSprite(sprite, panel);
}
