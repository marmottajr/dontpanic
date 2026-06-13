import { AppService } from './app.service';

describe('AppService', () => {
  it('returns the canonical greeting payload', () => {
    const result = new AppService().hello();
    expect(result).toEqual({
      message: 'Hello, World!',
      hint: "Don't Panic.",
      answer: 42,
      marvin: "Life? Don't talk to me about life.",
    });
  });
});
