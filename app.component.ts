import { Component, ChangeDetectionStrategy, signal, inject, computed, effect, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GeminiService, FormatOption } from './services/gemini.service';

// Declare global libraries loaded from CDN
declare var Prism: any;
declare var html2canvas: any;
declare var jspdf: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GeminiService]
})
export class AppComponent {
  private readonly geminiService = inject(GeminiService);
  private readonly platformId = inject(PLATFORM_ID);

  markdownInput = signal<string>('# مرحبًا بك!\n\nاكتب نص الماركداون هنا للبدء.\n\n*   عنصر قائمة أول\n*   عنصر قائمة ثاني\n\n```javascript\nconsole.log("Hello, World!");\n```');
  outputContent = signal<string>('');
  selectedFormat = signal<string>('html');
  isLoading = signal<boolean>(false);
  loadingMessage = signal<string>('يقوم الذكاء الاصطناعي بالتحويل...');
  error = signal<string | null>(null);
  copyButtonText = signal<string>('نسخ');
  isApiKeyMissing = this.geminiService.isApiKeyMissing;

  supportedFormats: FormatOption[] = [
    { value: 'html', name: 'HTML, CSS, & JS' },
    { value: 'pdf', name: 'PDF (من HTML)' },
    { value: 'typescript', name: 'TypeScript' },
    { value: 'javascript', name: 'JavaScript' },
    { value: 'python', name: 'Python' },
    { value: 'django', name: 'Django (Python)' },
    { value: 'go', name: 'Go' },
    { value: 'csharp', name: 'C#' },
    { value: 'c', name: 'C' },
    { value: 'cpp', name: 'C++' },
    { value: 'java', name: 'Java' },
    { value: 'kotlin', name: 'Kotlin' },
    { value: 'dart', name: 'Dart' },
    { value: 'ring', name: 'Ring' },
    { value: 'alef', name: 'ألف البرمجية العربية' },
    { value: 'asas', name: 'أسس العربية' },
    { value: 'alkhwarizmi', name: 'لغة الخوارزمي' },
  ];

  prismLanguage = computed(() => {
    const format = this.selectedFormat();
    if (format === 'html') return 'language-markup';
    if (format === 'pdf') return ''; // No highlighting for PDF
    return `language-${format}`;
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const savedFormat = localStorage.getItem('selectedFormat');
        const isValidFormat = this.supportedFormats.some(f => f.value === savedFormat);
        if (savedFormat && isValidFormat) {
          this.selectedFormat.set(savedFormat);
        }
      } catch (e) {
        console.error('Failed to access localStorage', e);
      }
    }
    
    effect(() => {
      // This effect runs whenever outputContent changes
      const content = this.outputContent();
      if (content && isPlatformBrowser(this.platformId) && typeof Prism !== 'undefined' && this.selectedFormat() !== 'pdf') {
        // Use a timeout to allow Angular to render the new content in the DOM first
        setTimeout(() => Prism.highlightAll(), 0);
      }
    });
  }

  onInputChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.markdownInput.set(target.value);
    if (this.error()) {
      this.error.set(null);
    }
  }

  onFormatChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newFormat = target.value;
    this.selectedFormat.set(newFormat);
    // Clear output and error when format changes
    this.outputContent.set('');
    this.error.set(null);

    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.setItem('selectedFormat', newFormat);
      } catch (e) {
        console.error('Failed to save to localStorage', e);
      }
    }
  }

  async convert(): Promise<void> {
    if (this.selectedFormat() === 'pdf') {
      await this.handlePdfConversion();
      return;
    }

    const markdown = this.markdownInput().trim();
    
    if (!markdown) {
      this.error.set('الرجاء إدخال نص ماركداون للتحويل.');
      return;
    }

    const SCRIPT_REGEX = /<script\b[^>]*>/i;
    if (SCRIPT_REGEX.test(markdown)) {
      this.error.set('تم اكتشاف محتوى قد يكون غير آمن (مثل علامات <script>). الرجاء إزالته والمحاولة مرة أخرى.');
      return;
    }

    if (markdown.length > 5000000) {
      this.error.set('المدخلات طويلة جدًا. الرجاء تقصير النص إلى أقل من 5,000,000 حرف.');
      return;
    }

    const markdownLength = markdown.length;
    if (markdownLength < 1000) {
      this.loadingMessage.set('يقوم الذكاء الاصطناعي بالتحويل...');
    } else if (markdownLength < 10000) {
      this.loadingMessage.set('جاري معالجة المستند...');
    } else {
      this.loadingMessage.set('قد يستغرق هذا وقتاً أطول للمستندات الكبيرة...');
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.outputContent.set('');

    try {
      const formatName = this.supportedFormats.find(f => f.value === this.selectedFormat())?.name || this.selectedFormat();
      const result = await this.geminiService.convertMarkdown(markdown, formatName);
      this.outputContent.set(result);
    } catch (e) {
      console.error(e);
      let errorMessage = 'حدث خطأ أثناء التحويل. الرجاء المحاولة مرة أخرى.';
      if (e instanceof Error) {
        errorMessage = e.message;
      }
      this.error.set(`فشل التحويل: ${errorMessage}`);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async handlePdfConversion(): Promise<void> {
    const htmlContent = this.markdownInput().trim();
    if (!htmlContent) {
      this.error.set('الرجاء إدخال محتوى HTML للتحويل إلى PDF.');
      return;
    }
    
    const htmlLength = htmlContent.length;
    if (htmlLength < 5000) {
      this.loadingMessage.set('جاري إنشاء ملف PDF...');
    } else if (htmlLength < 50000) {
      this.loadingMessage.set('جاري إنشاء PDF من مستند كبير...');
    } else {
      this.loadingMessage.set('إنشاء PDF قد يستغرق وقتاً أطول للمحتوى الكبير...');
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.outputContent.set('');

    if (!isPlatformBrowser(this.platformId)) {
      this.error.set('لا يمكن إنشاء ملفات PDF إلا في المتصفح.');
      this.isLoading.set(false);
      return;
    }

    try {
      const renderContainer = document.getElementById('pdf-render-source');
      if (!renderContainer) {
        throw new Error('لم يتم العثور على حاوية العرض اللازمة لإنشاء PDF.');
      }

      renderContainer.innerHTML = htmlContent;
      renderContainer.style.width = '794px'; // A4 width in pixels approx.

      const canvas = await html2canvas(renderContainer, { scale: 2, useCORS: true });
      
      renderContainer.innerHTML = '';
      renderContainer.style.width = 'auto';
      
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = canvas.height * pdfWidth / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position -= pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save('converted-document.pdf');
      this.outputContent.set('تم إنشاء ملف PDF بنجاح! يجب أن يبدأ التنزيل تلقائيًا.');

    } catch (e) {
      console.error('PDF Generation Error:', e);
      this.error.set('فشل إنشاء ملف PDF. تحقق من صحة كود HTML وحاول مرة أخرى.');
    } finally {
      this.isLoading.set(false);
    }
  }

  copyOutput(): void {
    if (!this.outputContent() || this.selectedFormat() === 'pdf') return;
    navigator.clipboard.writeText(this.outputContent()).then(() => {
      this.copyButtonText.set('تم النسخ!');
      setTimeout(() => this.copyButtonText.set('نسخ'), 2000);
    });
  }

  private getFileExtension(format: string): string {
    const extensionMap: { [key: string]: string } = {
      html: '.html',
      typescript: '.ts',
      javascript: '.js',
      python: '.py',
      django: '.py',
      go: '.go',
      csharp: '.cs',
      c: '.c',
      cpp: '.cpp',
      java: '.java',
      kotlin: '.kt',
      dart: '.dart',
      ring: '.ring',
      alef: '.alef',
      asas: '.asas',
      alkhwarizmi: '.kh',
    };
    return extensionMap[format] || '.txt';
  }

  downloadOutput(): void {
    const content = this.outputContent();
    const format = this.selectedFormat();

    if (!content || format === 'pdf' || !isPlatformBrowser(this.platformId)) {
      return;
    }

    const extension = this.getFileExtension(format);
    const filename = `converted-code${extension}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // The link must be in the DOM for the click to work on some browsers.
    // We hide it to avoid affecting the layout. Using `display: 'none'` can
    // sometimes prevent the click from registering on mobile. A more robust
    // approach is to keep it "visible" but off-screen.
    link.style.position = 'absolute';
    link.style.left = '-9999px';
    document.body.appendChild(link);

    link.click();

    // We clean up by removing the link and revoking the object URL.
    // A longer timeout is more reliable on mobile to ensure the download starts.
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 500);
  }
}