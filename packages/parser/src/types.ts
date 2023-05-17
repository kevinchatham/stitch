import { IRecognitionException } from 'chevrotain';
import type { Location } from './symbols.location.js';

export type GmlParseError = IRecognitionException;

export type GmlSymbolKind =
  | 'gmlFunction'
  | 'gmlVariable'
  | 'gmlConstant'
  | 'gmlType';

export type SymbolKind =
  | 'projectSymbol'
  | 'localVariable'
  | 'globalVariable'
  | 'functionParam'
  | 'selfVariable'
  | 'globalFunction'
  | 'macro'
  | 'enum'
  | 'enumMember';

export type SelfKind = 'struct' | 'instance' | 'global' | 'asset' | 'unknown';

export interface SymbolBase {
  readonly type: 'symbol';
  /** If true, then this is a built-in GML symbol. */
  readonly native: boolean;
  get name(): string;
  get description(): string | undefined;
  addRef(location: Location): void;
  /** Markdown code snippet representing this symbol, e.g. its function signature */
  get code(): string | undefined;
}

export interface SymbolRefBase {
  readonly type: 'symbolRef';
  readonly symbol: SymbolBase;
  readonly location: Location;
  get start(): number;
  get end(): number;
}

export interface SelfBase {
  readonly type: 'self';
  readonly kind: SelfKind;
}

export interface Diagnostic {
  type: 'diagnostic';
  kind: 'parser';
  message: string;
  severity: 'error' | 'warning' | 'info';
  location: {
    file: string;
    startColumn: number;
    endColumn: number;
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  info?: GmlParseError;
}
