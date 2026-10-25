import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

class TeachingPlanExport {
  const TeachingPlanExport({
    required this.title,
    required this.teachingDate,
    required this.classLabel,
    required this.grade,
    required this.objectives,
    required this.curriculumReferences,
    required this.sequence,
    required this.vocabulary,
    required this.notes,
    required this.reflection,
  });

  final String title;
  final String teachingDate;
  final String classLabel;
  final int grade;
  final List<String> objectives;
  final List<String> curriculumReferences;
  final List<String> sequence;
  final List<String> vocabulary;
  final String notes;
  final String reflection;
}

class DocumentExportService {
  const DocumentExportService();

  Future<void> printTeachingPlan(TeachingPlanExport plan) async {
    final document = pw.Document(
      title: plan.title,
      author: 'LinguaKids educator workspace',
      subject: 'Generic teaching plan',
    );
    document.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(42),
        header: (context) => pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [pw.Text('LinguaKids', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)), pw.Text('Generic teaching plan')],
        ),
        build: (context) => [
          pw.Header(level: 0, text: plan.title),
          pw.TableHelper.fromTextArray(
            data: [
              ['Teaching date', plan.teachingDate],
              ['Class label', plan.classLabel],
              ['Grade', '${plan.grade}'],
            ],
          ),
          _section('Learning objectives', plan.objectives),
          _section('Curriculum references', plan.curriculumReferences),
          _section('Selected lessons, games, or quizzes', plan.sequence),
          _section('Vocabulary', plan.vocabulary),
          pw.Header(level: 1, text: 'Educator notes'),
          pw.Text(plan.notes),
          pw.Header(level: 1, text: 'Reflection after teaching'),
          pw.Text(plan.reflection),
          pw.SizedBox(height: 16),
          pw.Text(
            'This is a generic lesson-plan export. It is not presented as an official DepEd DLL or DLP template.',
            style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700),
          ),
        ],
      ),
    );
    await Printing.layoutPdf(onLayout: (_) => document.save(), name: '${plan.title}.pdf');
  }

  pw.Widget _section(String title, List<String> values) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          pw.Header(level: 1, text: title),
          if (values.isEmpty) pw.Text('None recorded') else pw.Bullet(text: values.join('\n')),
        ],
      );
}
