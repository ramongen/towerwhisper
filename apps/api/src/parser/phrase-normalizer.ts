import { Injectable, NotImplementedException } from '@nestjs/common';

/** Lowercases, strips punctuation and normalises ICAO numbers ('niner' -> 9, 'flight level six zero' -> FL060). */
@Injectable()
export class PhraseNormalizer {
  normalize(_text: string): string {
    throw new NotImplementedException('PhraseNormalizer.normalize');
  }
}
