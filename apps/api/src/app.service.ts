import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  hello() {
    return {
      message: 'Hello, World!',
      hint: "Don't Panic.",
      answer: 42,
      marvin: "Life? Don't talk to me about life.",
    };
  }
}
