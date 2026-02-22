#include <map>
#include <ranges>
#include <vector>

int main ( )
{
    auto m = std::vector<int>() | std::ranges::to<std::map<int, int>>();
}