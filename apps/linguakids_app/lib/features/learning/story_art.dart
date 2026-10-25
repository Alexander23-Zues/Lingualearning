import 'package:flutter/material.dart';

import 'learning_data.dart';

const storyColors = [
  Color(0xFFDA6B37),
  Color(0xFF168DA3),
  Color(0xFF508740),
  Color(0xFF7853AA),
];

/// Each region is a complete original illustration from the 4 × 4 image atlas.
/// The sheet remains a single asset; no generated image is re-edited or cropped on disk.
class AnimalScene extends StatelessWidget {
  const AnimalScene({
    required this.scene,
    this.aspectRatio = 1.4,
    this.label = 'Colorful animal friends',
    super.key,
  });
  final int scene;
  final double aspectRatio;
  final String label;
  @override
  Widget build(BuildContext context) => Semantics(
    image: true,
    label: label,
    child: AspectRatio(
      aspectRatio: aspectRatio,
      child: ClipRect(
        child: LayoutBuilder(
          builder: (context, box) {
            final side = box.maxWidth > box.maxHeight
                ? box.maxWidth
                : box.maxHeight;
            final cell = scene.clamp(0, 15);
            final x = cell % 4, y = cell ~/ 4;
            return Stack(
              children: [
                Positioned(
                  left: (box.maxWidth - side) / 2 - x * side,
                  top: (box.maxHeight - side) / 2 - y * side,
                  width: side * 4,
                  height: side * 4,
                  child: Image.asset(
                    'assets/images/animal-story-atlas.png',
                    fit: BoxFit.fill,
                    excludeFromSemantics: true,
                  ),
                ),
              ],
            );
          },
        ),
      ),
    ),
  );
}

class AnimalWelcome extends StatelessWidget {
  const AnimalWelcome({
    required this.title,
    required this.message,
    this.scene = 0,
    super.key,
  });
  final String title, message;
  final int scene;
  @override
  Widget build(BuildContext context) => Card(
    clipBehavior: Clip.antiAlias,
    color: const Color(0xFFE9F7F2),
    child: LayoutBuilder(
      builder: (context, box) => box.maxWidth < 480
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  height: 135,
                  child: AnimalScene(scene: scene, aspectRatio: 3),
                ),
                _copy(context),
              ],
            )
          : Row(
              children: [
                SizedBox(
                  width: 180,
                  child: AnimalScene(scene: scene, aspectRatio: 1),
                ),
                Expanded(child: _copy(context)),
              ],
            ),
    ),
  );
  Widget _copy(BuildContext context) => Padding(
    padding: const EdgeInsets.all(20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(message, style: const TextStyle(fontSize: 17, height: 1.4)),
      ],
    ),
  );
}

class StoryBookCover extends StatelessWidget {
  const StoryBookCover({
    required this.material,
    required this.onOpen,
    super.key,
  });
  final Json material;
  final VoidCallback onOpen;
  @override
  Widget build(BuildContext context) {
    final body = Map<String, dynamic>.from(material['body'] as Map? ?? {});
    final scene = (body['cover_scene'] as num? ?? 0).toInt();
    final pages = jsonRows(body['pages']);
    final color = storyColors[(scene ~/ 4).clamp(0, 3)];
    return Semantics(
      button: true,
      label: 'Read ${material['title']}, ${pages.length} pages',
      child: Padding(
        padding: const EdgeInsets.fromLTRB(0, 0, 8, 12),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: const Color(0xFFE8DFC9),
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: .15),
                blurRadius: 14,
                offset: const Offset(6, 7),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.only(right: 5, bottom: 5),
            child: Material(
              color: color,
              borderRadius: BorderRadius.circular(18),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: onOpen,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 16,
                      height: 390,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            Colors.black.withValues(alpha: .22),
                            Colors.white.withValues(alpha: .2),
                            Colors.transparent,
                          ],
                        ),
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const SizedBox(height: 14),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.auto_stories_rounded,
                                  color: Colors.white,
                                  size: 18,
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    'A LITTLE ANIMAL ADVENTURE',
                                    style: TextStyle(
                                      color: Colors.white.withValues(alpha: .9),
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 1,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text(
                              '${material['title']}',
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w900,
                                height: 1.15,
                                color: Colors.white,
                              ),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          ClipRRect(
                            borderRadius: const BorderRadius.only(
                              topLeft: Radius.circular(45),
                            ),
                            child: AnimalScene(
                              scene: scene,
                              aspectRatio: 1.35,
                              label:
                                  'Cover illustration for ${material['title']}',
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Grade ${material['grade_level']} · ${pages.length} illustrated pages\nEnglish + Filipino',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                FilledButton.icon(
                                  style: FilledButton.styleFrom(
                                    backgroundColor: Colors.white,
                                    foregroundColor: color,
                                    minimumSize: const Size(
                                      double.infinity,
                                      50,
                                    ),
                                  ),
                                  onPressed: onOpen,
                                  icon: const Icon(Icons.menu_book_rounded),
                                  label: const Text(
                                    'Read this book',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class KidChoiceButton extends StatelessWidget {
  const KidChoiceButton({
    required this.letter,
    required this.text,
    required this.selected,
    required this.onTap,
    this.emoji,
    super.key,
  });
  final String letter, text;
  final bool selected;
  final VoidCallback onTap;
  final String? emoji;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    label: '$letter. $text',
    excludeSemantics: true,
    child: Material(
      color: selected ? const Color(0xFFE0F4EF) : Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          constraints: const BoxConstraints(minHeight: 76),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected
                  ? const Color(0xFF188C7B)
                  : const Color(0xFFD9E1EE),
              width: selected ? 3 : 2,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected
                      ? const Color(0xFF188C7B)
                      : const Color(0xFFEAF0FF),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  letter,
                  style: TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w900,
                    color: selected ? Colors.white : const Color(0xFF334F83),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              if (emoji != null) ...[
                Text(emoji!, style: const TextStyle(fontSize: 28)),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Text(
                  text,
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
              ),
              if (selected)
                const Padding(
                  padding: EdgeInsets.only(left: 8),
                  child: Icon(
                    Icons.check_circle_rounded,
                    color: Color(0xFF188C7B),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}
