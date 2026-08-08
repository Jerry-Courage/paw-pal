"""
Management command to test the Scene Planner against a real resource.

Usage:
  python manage.py test_scene_planner              # Test with first available resource
  python manage.py test_scene_planner --resource-id 5  # Test specific resource
  python manage.py test_scene_planner --refresh    # Force regeneration
"""

import time
import json
from django.core.management.base import BaseCommand
from library.models import Resource


class Command(BaseCommand):
    help = 'Test the AI Scene Planner against a real resource'

    def add_arguments(self, parser):
        parser.add_argument('--resource-id', type=int, help='Specific resource ID to test')
        parser.add_argument('--refresh', action='store_true', help='Force regeneration')
        parser.add_argument('--deterministic-only', action='store_true', help='Test deterministic fallback only')

    def handle(self, *args, **options):
        resource_id = options.get('resource_id')
        refresh = options.get('refresh', False)
        det_only = options.get('deterministic_only', False)

        # Find resource
        if resource_id:
            try:
                resource = Resource.objects.get(id=resource_id)
            except Resource.DoesNotExist:
                self.stderr.write(self.style.ERROR(f'Resource {resource_id} not found'))
                return
        else:
            resource = Resource.objects.filter(
                ai_notes_json__isnull=False
            ).exclude(ai_notes_json={}).first()
            if not resource:
                self.stderr.write(self.style.ERROR('No resources with ai_notes_json found'))
                return

        self.stdout.write(f'\n{"="*60}')
        self.stdout.write(f'Testing Scene Planner')
        self.stdout.write(f'Resource: {resource.title} (id={resource.id})')
        self.stdout.write(f'Subject: {resource.subject or "N/A"}')
        self.stdout.write(f'Has ai_notes_json: {bool(resource.ai_notes_json)}')
        notes = resource.ai_notes_json or {}
        self.stdout.write(f'Notes keys: {list(notes.keys())}')
        self.stdout.write(f'{"="*60}\n')

        # Test deterministic fallback
        self.stdout.write('--- Deterministic Fallback Test ---')
        from library.scene_planner import generate_deterministic_scene
        start = time.time()
        det_scene = generate_deterministic_scene(resource)
        det_time = time.time() - start
        self.stdout.write(f'  Time: {det_time:.3f}s')
        self.stdout.write(f'  Objects: {len(det_scene.get("objects", []))}')
        self.stdout.write(f'  Interactions: {len(det_scene.get("interactions", []))}')
        self.stdout.write(f'  Learning objectives: {len(det_scene.get("learningObjectives", []))}')
        self.stdout.write(f'  Learning path: {len(det_scene.get("learningPath", []))}')
        resolved = sum(1 for o in det_scene.get('objects', []) if o.get('assetId'))
        total = len(det_scene.get('objects', []))
        self.stdout.write(f'  Assets resolved: {resolved}/{total}')
        self.stdout.write('')

        if det_only:
            self.stdout.write(self.style.WARNING('Deterministic-only mode. Skipping AI test.'))
            self.stdout.write(json.dumps(det_scene, indent=2)[:2000])
            return

        # Test AI scene planner
        self.stdout.write('--- AI Scene Planner Test ---')
        from library.scene_planner import generate_scene_spec
        start = time.time()
        try:
            ai_scene = generate_scene_spec(resource, refresh=refresh)
            ai_time = time.time() - start

            if ai_scene:
                self.stdout.write(self.style.SUCCESS(f'  SUCCESS ({ai_time:.1f}s)'))
                self.stdout.write(f'  Title: {ai_scene.get("title", "N/A")}')
                self.stdout.write(f'  Subject: {ai_scene.get("subject", "N/A")}')
                self.stdout.write(f'  Objects: {len(ai_scene.get("objects", []))}')
                self.stdout.write(f'  Interactions: {len(ai_scene.get("interactions", []))}')
                self.stdout.write(f'  Learning objectives: {len(ai_scene.get("learningObjectives", []))}')
                self.stdout.write(f'  Learning path: {len(ai_scene.get("learningPath", []))}')

                objects = ai_scene.get('objects', [])
                resolved = sum(1 for o in objects if o.get('assetId'))
                self.stdout.write(f'  Assets resolved: {resolved}/{len(objects)}')

                # Show object details
                self.stdout.write('\n  Objects:')
                for i, obj in enumerate(objects):
                    asset = obj.get('assetId') or 'null'
                    pos = obj.get('position', {})
                    self.stdout.write(
                        f'    {i+1}. [{obj["id"]}] {obj["label"]} '
                        f'(asset={asset}, pos=({pos.get("x",0):.1f},{pos.get("y",0):.1f},{pos.get("z",0):.1f}))'
                    )

                # Show learning path
                path = ai_scene.get('learningPath', [])
                if path:
                    self.stdout.write(f'\n  Learning path: {" → ".join(path)}')

                # Show learning objectives
                for obj in ai_scene.get('learningObjectives', []):
                    self.stdout.write(f'  Objective: {obj[:80]}')

                # Validate JSON serializable
                try:
                    json.dumps(ai_scene)
                    self.stdout.write(self.style.SUCCESS('\n  JSON serializable: YES'))
                except (TypeError, ValueError) as e:
                    self.stdout.write(self.style.ERROR(f'\n  JSON serializable: NO - {e}'))
            else:
                self.stdout.write(self.style.WARNING(f'  FAILED ({ai_time:.1f}s) - returned None'))
                self.stdout.write('  Falling back to deterministic scene')

        except Exception as e:
            ai_time = time.time() - start
            self.stdout.write(self.style.ERROR(f'  ERROR ({ai_time:.1f}s): {e}'))

        self.stdout.write(f'\n{"="*60}')
        self.stdout.write('Done.')
