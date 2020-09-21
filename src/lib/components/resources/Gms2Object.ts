import { YyData } from "../../../types/Yy";
import { Gms2ResourceBase } from "./Gms2ResourceBase";

export class Gms2Object extends Gms2ResourceBase {

  protected yyData!: YyData; // Happens in the super() constructor

  constructor(...setup: ConstructorParameters<typeof Gms2ResourceBase>) {
    super(...setup);
  }
}