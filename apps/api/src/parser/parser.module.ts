import { Module } from '@nestjs/common';
import { CallsignResolver } from './callsign-resolver';
import { LlmParser } from './llm-parser';
import { ParserService } from './parser.service';
import { PhraseNormalizer } from './phrase-normalizer';
import { RuleParser } from './rule-parser';

@Module({
  providers: [PhraseNormalizer, RuleParser, LlmParser, CallsignResolver, ParserService],
  exports: [ParserService, PhraseNormalizer],
})
export class ParserModule {}
