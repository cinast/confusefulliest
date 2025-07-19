import argparse
import logging
from pathlib import Path
from core.drawio_generator import DrawIOGenerator
from core.parserSwitch import CodeParser


def setup_logging():
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
    )


def main():
    # 命令行初始化
    setup_logging()
    logger = logging.getLogger(__name__)
    parser = argparse.ArgumentParser(
        description="Generate architecture diagrams from TS/JS code"
    )
    parser.add_argument("input", help="Input TypeScript/JavaScript file")
    parser.add_argument(
        "-o", "--output", default="output.drawio", help="Output drawio file path"
    )

    args = parser.parse_args()

    # Check input file exists
    if not Path(args.input).exists():
        logger.error(f"Input file {args.input} not found")
        return

    # Parse the input file
    logger.info(f"Parsing {args.input}...")
    parser = CodeParser()
    ast_data = parser.parsingFile(args.input)

    if not ast_data:
        logger.error("Failed to parse input file")
        return

    # Generate visualization
    logger.info(f"Generating {args.output}...")
    generator = DrawIOGenerator()
    generator.generate_drawio(ast_data, args.output)
    logger.info("Done!")


if __name__ == "__main__":
    main()
