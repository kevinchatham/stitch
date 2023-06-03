// CST Visitor for creating an AST etc
import assert from 'assert';
import type { CstNode, CstNodeLocation, IToken } from 'chevrotain';
import type {
  EnumStatementCstChildren,
  FunctionExpressionCstChildren,
  GlobalVarDeclarationCstChildren,
  IdentifierAccessorCstChildren,
  MacroStatementCstChildren,
} from '../gml-cst.js';
import { GmlVisitorBase } from './parser.js';
import type { Code } from './project.code.js';
import { Position, Range } from './project.location.js';
import { PrimitiveName } from './project.primitives.js';
import { Symbol } from './project.symbol.js';
import { EnumType, StructType, TypeMember } from './project.type.js';

export function processGlobalSymbols(file: Code) {
  const processor = new GlobalDeclarationsProcessor(file);
  const visitor = new GmlGlobalDeclarationsVisitor(processor);
  visitor.extractGlobalDeclarations(file.cst);
}

class GlobalDeclarationsProcessor {
  protected readonly localScopeStack: StructType[] = [];
  readonly start: Position;

  constructor(readonly file: Code) {
    this.localScopeStack.push(file.scopes[0].local);
    this.start = file.scopes[0].start;
  }

  range(loc: CstNodeLocation) {
    return Range.fromCst(this.start.file, loc);
  }

  get currentLocalScope() {
    return this.localScopeStack.at(-1)!;
  }

  pushLocalScope() {
    const localScope = this.project.createStructType();
    this.localScopeStack.push(localScope);
  }

  popLocalScope() {
    this.localScopeStack.pop();
  }

  get asset() {
    return this.file.asset;
  }

  get project() {
    return this.asset.project;
  }
}

/**
 * Visits the CST and creates symbols and types for global
 * declarations.
 */
export class GmlGlobalDeclarationsVisitor extends GmlVisitorBase {
  static validated = false;

  /**
   * Register a global identifier from its declaration. Note that
   * global identifiers are not deleted when their definitions are,
   * so we need to either create *or update* the corresponding symbol/typeMember.
   */
  ADD_GLOBAL_DECLARATION<T extends PrimitiveName>(
    children: { Identifier?: IToken[] },
    typeName: T,
    addToGlobalSelf = false,
  ): Symbol | TypeMember | undefined {
    const name = children.Identifier?.[0];
    if (!name) return;
    const range = this.PROCESSOR.range(name);
    const type = this.PROCESSOR.project
      .createType(typeName)
      .definedAt(range)
      .named(name.image);
    type.global = true;

    // Create it if it doesn't already exist.
    let symbol = this.PROCESSOR.project.getGlobal(name.image)?.symbol as
      | Symbol
      | TypeMember;
    if (!symbol) {
      symbol = new Symbol(name.image).addType(type);
      if (typeName === 'Constructor') {
        // Ensure the constructed type exists
        symbol.type.constructs = this.PROCESSOR.project
          .createStructType('self')
          .definedAt(range)
          .named(name.image);
        symbol.type.constructs.global = true;
      }
      // Add the symbol and type to the project.
      this.PROCESSOR.project.addGlobal(symbol, addToGlobalSelf);
    }
    // Ensure it's defined here.
    symbol.definedAt(range);
    symbol.global = true;
    symbol.addRef(range, symbol.type);
    type.addRef(range);
    return symbol;
  }

  extractGlobalDeclarations(input: CstNode) {
    this.visit(input);
    return this.PROCESSOR;
  }

  /**
   * Collect the enum symbol *and* its members, since all of those
   * are globally visible.
   */
  override enumStatement(children: EnumStatementCstChildren) {
    const symbol = this.ADD_GLOBAL_DECLARATION(children, 'Enum')! as Symbol;
    const type = symbol.type as EnumType;
    assert(type.kind === 'Enum', `Symbol ${symbol.name} is not an enum.`);
    // Might be updating an existing enum, so mutate members instead
    // of wholesale replacing to maintain cross-references.
    for (let i = 0; i < children.enumMember.length; i++) {
      const name = children.enumMember[i].children.Identifier[0];
      const range = this.PROCESSOR.range(name);
      const memberType = this.PROCESSOR.project
        .createType('EnumMember')
        .definedAt(range)
        .named(name.image);
      // Does member already exist?
      const member =
        type.getMember(name.image) || type.addMember(name.image, memberType);
      member.type ||= memberType;
      member.idx = i;
      member.definedAt(range);
      member.addRef(range);
    }
    // TODO: Remove any members that are not defined here.
  }

  /**
   * Identify global function declarations and store them as
   * symbols or `global.` types. For constructors, add the
   * corresponding types.
   */
  override functionExpression(children: FunctionExpressionCstChildren) {
    const isGlobal =
      this.PROCESSOR.currentLocalScope ===
        this.PROCESSOR.file.scopes[0].local &&
      this.PROCESSOR.asset.assetType === 'scripts';
    // Functions create a new localscope. Keeping track of that is important
    // for making sure that we're looking at a global function declaration.
    this.PROCESSOR.pushLocalScope();
    const name = children.Identifier?.[0];
    // Add the function to a table of functions
    if (name && isGlobal) {
      const isConstructor = !!children.constructorSuffix?.[0];
      this.ADD_GLOBAL_DECLARATION(
        children,
        isConstructor ? 'Constructor' : 'Function',
      )!;
    }
    this.visit(children.blockStatement);

    // End the scope
    this.PROCESSOR.popLocalScope();
  }

  override globalVarDeclaration(children: GlobalVarDeclarationCstChildren) {
    this.ADD_GLOBAL_DECLARATION(children, 'Unknown') as TypeMember;
  }

  override macroStatement(children: MacroStatementCstChildren) {
    this.ADD_GLOBAL_DECLARATION(children, 'Macro')!;
  }

  override identifierAccessor(children: IdentifierAccessorCstChildren) {
    // Add global.whatever symbols
    const isGlobal = children.identifier[0].children.Global?.[0];
    if (isGlobal) {
      const identifier =
        children.accessorSuffixes?.[0].children.dotAccessSuffix?.[0].children
          .identifier[0].children;
      if (identifier?.Identifier) {
        this.ADD_GLOBAL_DECLARATION(identifier, 'Unknown', true);
      }
    }

    // Still visit the rest
    if (children.accessorSuffixes) {
      this.visit(children.accessorSuffixes);
    }
  }

  constructor(readonly PROCESSOR: GlobalDeclarationsProcessor) {
    super();
    if (!GmlGlobalDeclarationsVisitor.validated) {
      // Validator logic only needs to run once, since
      // new instances will be the same.
      this.validateVisitor();
      GmlGlobalDeclarationsVisitor.validated = true;
    }
  }
}