import { Controller, Get, HttpCode } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  hello() {
    return this.appService.hello();
  }

  /** Easter egg: HTTP 418. Marvin disapproves. */
  @Public()
  @Get('teapot')
  @HttpCode(418)
  teapot() {
    return {
      statusCode: 418,
      message: "I'm a teapot. I can't brew coffee, but Don't Panic.",
      marvin: 'I could calculate the odds of you wanting coffee, but you wouldn’t like them.',
    };
  }
}
