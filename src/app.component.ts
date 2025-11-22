import { Component, OnInit, OnDestroy, signal, computed, effect, ChangeDetectionStrategy, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';

type TimerMode = 'pomodoro' | 'shortBreak' | 'longBreak';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  // Constants for timer durations in seconds
  private readonly POMODORO_TIME = 25 * 60;
  private readonly SHORT_BREAK_TIME = 5 * 60;
  private readonly LONG_BREAK_TIME = 15 * 60;

  // --- Language and Translation State ---
  language: WritableSignal<'en' | 'ar'> = signal('en');
  
  private readonly translations = {
    en: {
      title: 'Visual Pomodoro Timer',
      subtitle: 'Your companion for focused work sessions.',
      pomodoro: 'Pomodoro',
      shortBreak: 'Short Break',
      longBreak: 'Long Break',
      start: 'Start',
      pause: 'Pause',
      reset: 'Reset',
      ariaReset: 'Reset Timer',
      docTitleFocus: 'Time to Focus',
      docTitleShort: 'Short Break',
      docTitleLong: 'Long Break',
    },
    ar: {
      title: 'مؤقت بومودورو المرئي',
      subtitle: 'رفيقك في جلسات العمل المركزة.',
      pomodoro: 'تركيز',
      shortBreak: 'استراحة قصيرة',
      longBreak: 'استراحة طويلة',
      start: 'ابدأ',
      pause: 'إيقاف مؤقت',
      reset: 'إعادة ضبط',
      ariaReset: 'إعادة ضبط المؤقت',
      docTitleFocus: 'وقت التركيز',
      docTitleShort: 'استراحة قصيرة',
      docTitleLong: 'استراحة طويلة',
    }
  };

  t = computed(() => this.translations[this.language()]);
  direction = computed(() => this.language() === 'ar' ? 'rtl' : 'ltr');

  // --- Core Timer State ---
  timerMode: WritableSignal<TimerMode> = signal('pomodoro');
  totalTime = signal(this.POMODORO_TIME);
  timeLeft = signal(this.POMODORO_TIME);
  isRunning = signal(false);

  private timerId: any = null;
  private notificationSound: HTMLAudioElement;

  // Computed Signals for display
  minutes = computed(() => Math.floor(this.timeLeft() / 60));
  seconds = computed(() => this.timeLeft() % 60);
  displayTime = computed(() => `${this.padZero(this.minutes())}:${this.padZero(this.seconds())}`);
  
  // Computed values for the active theme
  activeBgClass = computed(() => {
    switch(this.timerMode()) {
      case 'pomodoro': return 'bg-red-500 hover:bg-red-600';
      case 'shortBreak': return 'bg-sky-500 hover:bg-sky-600';
      case 'longBreak': return 'bg-purple-500 hover:bg-purple-600';
      default: return 'bg-red-500 hover:bg-red-600';
    }
  });
  
  activeModeBgClass = computed(() => {
    switch(this.timerMode()) {
        case 'pomodoro': return 'bg-red-500 text-white';
        case 'shortBreak': return 'bg-sky-500 text-white';
        case 'longBreak': return 'bg-purple-500 text-white';
        default: return 'bg-red-500 text-white';
    }
  });

  activeHandBgClass = computed(() => {
    switch(this.timerMode()) {
      case 'pomodoro': return 'bg-red-400';
      case 'shortBreak': return 'bg-sky-400';
      case 'longBreak': return 'bg-purple-400';
      default: return 'bg-red-400';
    }
  });

  // Analog Clock Display
  hourMarkers = Array.from({length: 12}, (_, i) => i + 1);

  progressHandAngle = computed(() => {
    if (this.totalTime() === 0) return 0;
    const progress = (this.totalTime() - this.timeLeft()) / this.totalTime();
    return progress * 360;
  });

  secondHandAngle = computed(() => {
    const secondsElapsedTotal = this.totalTime() - this.timeLeft();
    const currentSecondInMinute = secondsElapsedTotal % 60;
    return currentSecondInMinute * 6;
  });

  constructor() {
    // A simple, royalty-free notification sound encoded in Base64
    const soundData = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjQ1LjEwMAAAAAAAAAAAAAAA//tAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1B0ZGgAAAA/AAAAAAAAA+g4BwwAAAAA//sAR2IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAMIASQAAAPAAwAABYAAABMAAABQAAA//sAADYASQAAAAIAAQAAA0gAAAFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AADgBIAAAAAAQABAAAISAAAAkgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAD4ASQAAAAQAAAAAASQAAA0gAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AAEABJAABABAAADSAAAASgAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sAwgAAB1oAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADUAhIAAAAAAABVAAMgAAAAAAAAAABkYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWH/8ADUAiQAAAIAAQAAABQFAAkABQkP/AADwAABcAAADSAAAASAABSAAA//sA5wBIAAAAAAEAAQAAAUgAAAFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADWAiQAAAEAAQAAAEgAAAEgAAAEwAAAAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sA6AAAB1oAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADgAiQAAAEAAQAAAFAAAAFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADgBCQAAAQAAAAAAUgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADkBCQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADkAiQAAAEAAQAAAFAAAAFIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADpBCQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADqAyQAAAEAAAAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADtBCQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADuAyQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8ADzBCQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AD0AyQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AD7AyQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AEBBDQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AEFAzQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AEJBDAAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AENAjQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8AESAjQAAAEAAQAAAEgAAAEgAAAEwAAAAAAAAAAAAAAAAD/8AINDAwMD/8AINCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgL/8AEfAzQAAAEAAQAAAFAAAAFIAAAAAAAAAAAAAAAAAD/8ACNDAAMD/8ACNAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//sAcAAAB1oAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV-';
    this.notificationSound = new Audio(soundData);
    
    // Effect to react to state changes
    effect(() => {
      // Save settings to localStorage
      localStorage.setItem('pomodoroTimerMode', this.timerMode());
      localStorage.setItem('pomodoroLanguage', this.language());

      // Update document title
      const modeTitle = this.t()[this.getModeTitleKey()];
      document.title = `${this.displayTime()} - ${modeTitle} | ${this.t().title}`;
      
      // Update html lang and dir attributes for accessibility and RTL support
      document.documentElement.lang = this.language();
      document.documentElement.dir = this.direction();
    });
  }
  
  getModeTitleKey(): 'docTitleFocus' | 'docTitleShort' | 'docTitleLong' {
      switch(this.timerMode()) {
          case 'pomodoro': return 'docTitleFocus';
          case 'shortBreak': return 'docTitleShort';
          case 'longBreak': return 'docTitleLong';
          default: return 'docTitleFocus';
      }
  }

  ngOnInit() {
    const savedMode = localStorage.getItem('pomodoroTimerMode') as TimerMode;
    if (savedMode && ['pomodoro', 'shortBreak', 'longBreak'].includes(savedMode)) {
      this.setTimerMode(savedMode);
    } else {
      this.setTimerMode('pomodoro');
    }

    const savedLang = localStorage.getItem('pomodoroLanguage') as 'en' | 'ar';
    if (savedLang && ['en', 'ar'].includes(savedLang)) {
        this.language.set(savedLang);
    }
  }

  ngOnDestroy() {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
  }

  private padZero(num: number): string {
    return num < 10 ? `0${num}` : `${num}`;
  }

  setTimerMode(mode: TimerMode) {
    this.timerMode.set(mode);
    let newTime = 0;
    switch (mode) {
      case 'pomodoro':
        newTime = this.POMODORO_TIME;
        break;
      case 'shortBreak':
        newTime = this.SHORT_BREAK_TIME;
        break;
      case 'longBreak':
        newTime = this.LONG_BREAK_TIME;
        break;
    }
    this.totalTime.set(newTime);
    this.resetTimer();
  }

  toggleTimer() {
    this.isRunning.update(running => !running);
    if (this.isRunning()) {
      this.startTimer();
    } else {
      this.pauseTimer();
    }
  }
  
  toggleLanguage() {
    this.language.update(lang => lang === 'en' ? 'ar' : 'en');
  }

  private startTimer() {
    if (this.timerId || this.timeLeft() === 0) return;
    this.timerId = setInterval(() => {
      this.timeLeft.update(time => {
        if (time > 1) {
          return time - 1;
        }
        // Timer finished
        this.playNotificationSound();
        this.resetTimer();
        return 0;
      });
    }, 1000);
  }

  private pauseTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  resetTimer() {
    this.pauseTimer();
    this.isRunning.set(false);
    this.timeLeft.set(this.totalTime());
  }

  private playNotificationSound() {
    this.notificationSound.currentTime = 0;
    this.notificationSound.play().catch(error => console.error("Error playing sound:", error));
  }
}
