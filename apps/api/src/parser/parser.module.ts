import { Module } from '@nestjs/common';
import { CallsignResolver } from './callsign-resolver';
import { LlmParser } from './llm-parser';
import { PhraseNormalizer } from './phrase-normalizer';
import { RuleParser } from './rule-parser';

@Module({
  providers: [PhraseNormalizer, RuleParser, LlmParser, CallsignResolver],
  exports: [PhraseNormalizer, RuleParser, LlmParser, CallsignResolver],
})
export class ParserModule {}
