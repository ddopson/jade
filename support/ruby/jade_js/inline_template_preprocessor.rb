module JadeJs
  class InlineTemplatePreprocessor < Sprockets::Processor
    def evaluate(context, locals)
      options_jade = {
        locals: {},
        client: true,
        compileDebug: false,
        filename: context.logical_path
      }
      options_jc = {
        locals: {},
        client: true,
        coffee: true,
        compileDebug: false,
        filename: context.logical_path
      }
      options_ijc = {
        locals: {},
        client: true,
        inline: true,
        coffee: true,
        rawdom: true,
        compileDebug: false,
        filename: context.logical_path
      }
      # DDOPSON-2012-12-06 - 'data' here comes from the ether and contains the textual contents of the asset we are editing
      # literally, I have no idea what rubyism makes 'data' defined, but it works, and it's what everyone else does
      # See http://psionides.eu/2012/05/06/extending-asset-pipeline-with-custom-preprocessors/
      data.gsub(/^
        ([ \t]*)                # capture leading indent ($1)
        ([^\n]*)                # capture existing line, eg "template = " ($2)
        """                     # opening """ token
        \s*                     # consume any spacing
        [!](jade|jc|ijc)\b[:]?  # Magic Token, eg '!ijc' ($3)
        [ \t]*[\n]?             # consume any spacing, newline
        (.*?)                   # capture template contents ($4)
        """                     # closing """ token
      /mx) { |m|
        indent, before_text, template_type, template_text = $1, $2, $3, $4
        case template_type
          when 'jade'
            # Jade will generate JS syntax, so we wrap it in `...` and escape any '`' characters from the JS code
            output = "#{before_text}`#{JadeJs.compile(template_text.strip_heredoc, options_jade).gsub('`', '\`')}`".gsub(/^/m, indent)
          when 'jc'
            # Jade will generate Coffee syntax, so we can pass it straight through as long as we add indentation to match the line where the """ was found
            output = "#{before_text}#{JadeJs.compile(template_text.strip_heredoc, options_jc)}".gsub(/^/m, indent)
          when 'ijc'
            # IJC simply calls the Coffee code immediately, allowing it to be used inline like a normal """ string
            output = "#{before_text}#{JadeJs.compile(template_text.strip_heredoc, options_ijc)}".gsub(/^/m, indent)
        end
        Rails.logger.info "InlineTemplatePreprocessor: processed #{template_text.lines.count} line '#{template_type}' template in #{context.logical_path} into:\n#{output}"
        output
      }
    end

    def self.register(env)
      env.register_preprocessor('application/javascript', InlineTemplatePreprocessor)
    end
  end
end
