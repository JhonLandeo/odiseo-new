import { IsString, MinLength, IsNotEmpty } from 'class-validator';

export class ChangePasswordDto {
  /**
   * Deliberately not length-validated. This is a password that already exists;
   * the only question that matters is whether bcrypt accepts it. Imposing the
   * current policy here would reject the credential of any account predating
   * that policy with a 400 instead of a truthful "wrong password", and would
   * leak the policy boundary to an attacker probing with guesses.
   */
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  // Matches the minimum already enforced on LoginDto.password and the admin
  // tenant DTOs — a stricter rule here would let an admin set a password its
  // owner could not choose for themselves.
  @IsString()
  @MinLength(8)
  newPassword: string;
}
