import { IsString, Matches, MaxLength } from 'class-validator';

export class VerifyDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsString()
  @Matches(/^0x[0-9a-fA-F]{130,}$/, { message: 'signature invalide' })
  @MaxLength(20000)
  signature: string;
}
